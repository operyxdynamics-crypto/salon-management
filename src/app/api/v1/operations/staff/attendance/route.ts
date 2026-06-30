import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { can } from "@/lib/rbac";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CLOCK_IN"),
    branchId: z.string().min(1),
    staffId: z.string().optional(),
    clockIn: z.iso.datetime().optional(),
    idempotencyKey: z.string().min(12).max(120),
  }),
  z.object({
    action: z.literal("CLOCK_OUT"),
    branchId: z.string().min(1),
    staffId: z.string().optional(),
    clockOut: z.iso.datetime().optional(),
    idempotencyKey: z.string().min(12).max(120),
  }),
  z.object({
    action: z.literal("REQUEST_CORRECTION"),
    branchId: z.string().min(1),
    staffId: z.string().optional(),
    clockIn: z.iso.datetime(),
    clockOut: z.iso.datetime().optional(),
    note: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().min(12).max(120),
  }),
  z.object({
    action: z.literal("MANUAL_CORRECTION"),
    branchId: z.string().min(1),
    staffId: z.string().min(1),
    clockIn: z.iso.datetime(),
    clockOut: z.iso.datetime().optional(),
    note: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().min(12).max(120),
  }),
]);

const patchSchema = z.object({
  branchId: z.string().min(1),
  attendanceId: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

function dayBounds(value: string) {
  const start = new Date(`${value}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function minutesBetween(start: Date, end: Date | null) {
  return end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)) : 0;
}

async function findAuthorizedStaff(staffId: string, tenantId: string, branchId: string) {
  return db.staff.findFirst({
    where: {
      id: staffId,
      user: { tenantId, isActive: true },
      OR: [{ branchId }, { branchAssignments: { some: { branchId } } }],
    },
    include: { user: true },
  });
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const branchId = params.get("branchId") ?? "";
    const date = params.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const staffId = params.get("staffId") ?? undefined;
    const context = await requireOperationsContext("staff:read", { branchId, requireBranch: true });
    const { start, end } = dayBounds(date);
    const staff = await db.staff.findMany({
      where: {
        id: staffId,
        user: { tenantId: context.tenant.id, isActive: true },
        OR: [{ branchId: context.branch!.id }, { branchAssignments: { some: { branchId: context.branch!.id } } }],
      },
      include: {
        user: true,
        attendance: { where: { branchId: context.branch!.id, clockIn: { lt: end }, OR: [{ clockOut: null }, { clockOut: { gt: start } }] }, orderBy: { clockIn: "asc" } },
        shifts: { where: { branchId: context.branch!.id, startsAt: { lt: end }, endsAt: { gt: start } }, orderBy: { startsAt: "asc" } },
        leaves: { where: { status: "APPROVED", startsAt: { lt: end }, endsAt: { gt: start } } },
      },
      orderBy: { user: { name: "asc" } },
    });
    return Response.json({
      data: {
        date,
        branch: { id: context.branch!.id, name: context.branch!.name },
        rows: staff.map((member) => {
          const approved = member.attendance.filter((entry) => entry.status === "APPROVED");
          const pending = member.attendance.filter((entry) => entry.status === "PENDING");
          const firstClockIn = approved[0]?.clockIn ?? null;
          const openEntry = approved.find((entry) => !entry.clockOut) ?? null;
          const shift = member.shifts[0] ?? null;
          const workedMinutes = approved.reduce((sum, entry) => sum + minutesBetween(entry.clockIn, entry.clockOut), 0);
          const expectedMinutes = shift ? minutesBetween(shift.startsAt, shift.endsAt) : 0;
          const lateMinutes = shift && firstClockIn ? Math.max(0, Math.round((firstClockIn.getTime() - shift.startsAt.getTime()) / 60_000)) : 0;
          const state = member.leaves.length ? "ON_LEAVE" : openEntry ? "CLOCKED_IN" : approved.length ? "PRESENT" : shift ? "ABSENT" : "OFF";
          return {
            staffId: member.id,
            name: member.user.name,
            role: member.jobTitle,
            state,
            shift: shift ? { id: shift.id, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString(), type: shift.type } : null,
            firstClockIn: firstClockIn?.toISOString() ?? null,
            lastClockOut: approved.filter((entry) => entry.clockOut).at(-1)?.clockOut?.toISOString() ?? null,
            openAttendanceId: openEntry?.id ?? null,
            workedMinutes,
            expectedMinutes,
            varianceMinutes: workedMinutes - expectedMinutes,
            lateMinutes,
            pendingCorrections: pending.length,
            onLeave: member.leaves.length > 0,
            entries: member.attendance.map((entry) => ({
              id: entry.id,
              clockIn: entry.clockIn.toISOString(),
              clockOut: entry.clockOut?.toISOString() ?? null,
              status: entry.status,
              source: entry.source,
              note: entry.note,
            })),
          };
        }),
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid attendance request", 400, parsed.error.flatten());
    const permission = parsed.data.action === "MANUAL_CORRECTION" ? "staff:write" : "self:read";
    const context = await requireOperationsContext(permission, { branchId: parsed.data.branchId, requireBranch: true });
    const selfStaffId = context.user.staff?.id;
    const staffId = parsed.data.staffId ?? selfStaffId;
    if (!staffId) throw new OperationsError("FORBIDDEN", "A staff profile is required", 403);
    const canManage = can(context.user.role, "staff:write");
    if (!canManage && staffId !== selfStaffId) throw new OperationsError("FORBIDDEN", "You can only manage your own attendance", 403);
    const staff = await findAuthorizedStaff(staffId, context.tenant.id, context.branch!.id);
    if (!staff) throw new OperationsError("NOT_FOUND", "Team member not found at this branch", 404);
    const existing = await db.attendance.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
    if (existing) return Response.json({ data: existing });

    if (parsed.data.action === "CLOCK_OUT") {
      const open = await db.attendance.findFirst({
        where: { staffId: staff.id, branchId: context.branch!.id, clockOut: null, status: "APPROVED" },
        orderBy: { clockIn: "desc" },
      });
      if (!open) throw new OperationsError("CONFLICT", "No open clock-in was found", 409);
      const clockOut = parsed.data.clockOut ? new Date(parsed.data.clockOut) : new Date();
      if (clockOut <= open.clockIn) throw new OperationsError("VALIDATION", "Clock-out must be after clock-in", 400);
      const updated = await db.$transaction(async (tx) => {
        const record = await tx.attendance.update({ where: { id: open.id }, data: { clockOut, idempotencyKey: parsed.data.idempotencyKey } });
        await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "STAFF_CLOCKED_OUT", entity: "Attendance", entityId: record.id, metadata: { staffId: staff.id, branchId: context.branch!.id } } });
        return record;
      });
      return Response.json({ data: updated });
    }

    const clockIn = "clockIn" in parsed.data && parsed.data.clockIn ? new Date(parsed.data.clockIn) : new Date();
    const clockOut = "clockOut" in parsed.data && parsed.data.clockOut ? new Date(parsed.data.clockOut) : null;
    if (clockOut && clockOut <= clockIn) throw new OperationsError("VALIDATION", "Clock-out must be after clock-in", 400);
    if (parsed.data.action === "CLOCK_IN") {
      const open = await db.attendance.findFirst({ where: { staffId: staff.id, branchId: context.branch!.id, clockOut: null, status: "APPROVED" } });
      if (open) throw new OperationsError("CONFLICT", "This team member is already clocked in", 409);
    }
    const status = parsed.data.action === "REQUEST_CORRECTION" ? "PENDING" : "APPROVED";
    const source = parsed.data.action === "CLOCK_IN" ? "CLOCK" : parsed.data.action === "REQUEST_CORRECTION" ? "CORRECTION_REQUEST" : "MANUAL";
    const created = await db.$transaction(async (tx) => {
      const record = await tx.attendance.create({
        data: {
          staffId: staff.id,
          branchId: context.branch!.id,
          clockIn,
          clockOut,
          status,
          source,
          note: "note" in parsed.data ? parsed.data.note : null,
          idempotencyKey: parsed.data.idempotencyKey,
        },
      });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: status === "PENDING" ? "ATTENDANCE_CORRECTION_REQUESTED" : "STAFF_CLOCKED_IN", entity: "Attendance", entityId: record.id, metadata: { staffId: staff.id, branchId: context.branch!.id, source } } });
      return record;
    });
    return Response.json({ data: created }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid attendance approval", 400, parsed.error.flatten());
    const context = await requireOperationsContext("staff:write", { branchId: parsed.data.branchId, requireBranch: true });
    const existing = await db.attendance.findFirst({ where: { id: parsed.data.attendanceId, branchId: context.branch!.id } });
    if (!existing) throw new OperationsError("NOT_FOUND", "Attendance record not found", 404);
    const updated = await db.$transaction(async (tx) => {
      const record = await tx.attendance.update({ where: { id: existing.id }, data: { status: parsed.data.status, note: parsed.data.note ?? existing.note } });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: parsed.data.status === "APPROVED" ? "ATTENDANCE_APPROVED" : "ATTENDANCE_REJECTED", entity: "Attendance", entityId: record.id, metadata: { branchId: context.branch!.id } } });
      return record;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
