import { z } from "zod";
import { assessCheckIn, type CheckInAssessment } from "@/lib/attendance";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CLOCK_IN"),
    branchId: z.string().min(1),
    staffId: z.string().optional(),
    clockIn: z.iso.datetime().optional(),
    /**
     * Where the device says it is. Optional on purpose: a refused permission, an old phone, or a
     * basement with no signal must never stop someone starting their shift. Absent location means
     * the record needs a human, not that the person is turned away.
     */
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracyMeters: z.number().nonnegative().max(100_000).optional(),
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
          // Two different questions, two different filters.
          //
          // "Is this person here?" counts anything not rejected - someone who arrived late is
          // standing in the salon whether or not a manager has blessed the record yet, and showing
          // them as ABSENT would be a lie the front desk can see through.
          //
          // "What are they owed?" counts approved only. That is the whole point of the queue.
          const live = member.attendance.filter((entry) => entry.status !== "REJECTED");
          const firstClockIn = live[0]?.clockIn ?? null;
          const openEntry = live.find((entry) => !entry.clockOut) ?? null;
          const shift = member.shifts[0] ?? null;
          const workedMinutes = approved.reduce((sum, entry) => sum + minutesBetween(entry.clockIn, entry.clockOut), 0);
          const expectedMinutes = shift ? minutesBetween(shift.startsAt, shift.endsAt) : 0;
          // Read the lateness decided at check-in rather than recomputing it. The stored value
          // already honoured the branch's grace period, and a roster edited afterwards must not
          // retroactively make someone late.
          const lateMinutes = live[0]?.lateMinutes ?? 0;
          const state = member.leaves.length ? "ON_LEAVE" : openEntry ? "CLOCKED_IN" : live.length ? "PRESENT" : shift ? "ABSENT" : "OFF";
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
              // The evidence a reviewer needs to judge a pending day, without leaving the queue.
              kind: entry.kind,
              distanceMeters: entry.distanceMeters,
              accuracyMeters: entry.accuracyMeters,
              lateMinutes: entry.lateMinutes,
              reviewedAt: entry.reviewedAt?.toISOString() ?? null,
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
    const canManage = context.permissions.has("staff:write");
    if (!canManage && staffId !== selfStaffId) throw new OperationsError("FORBIDDEN", "You can only manage your own attendance", 403);
    const staff = await findAuthorizedStaff(staffId, context.tenant.id, context.branch!.id);
    if (!staff) throw new OperationsError("NOT_FOUND", "Team member not found at this branch", 404);
    const existing = await db.attendance.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
    if (existing) return Response.json({ data: existing });

    if (parsed.data.action === "CLOCK_OUT") {
      // PENDING counts as open. A check-in awaiting approval is still someone at work, and refusing
      // to let them clock out would strand them clocked in until a manager got round to it.
      const open = await db.attendance.findFirst({
        where: { staffId: staff.id, branchId: context.branch!.id, clockOut: null, status: { in: ["APPROVED", "PENDING"] } },
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
    // Assess a real clock-in against the branch geofence and the rostered shift. A correction
    // request or a manager's manual entry is a human statement about the past, so location and
    // lateness say nothing useful about it.
    let assessment: CheckInAssessment | null = null;
    if (parsed.data.action === "CLOCK_IN") {
      const open = await db.attendance.findFirst({
        where: { staffId: staff.id, branchId: context.branch!.id, clockOut: null, status: { in: ["APPROVED", "PENDING"] } },
      });
      if (open) throw new OperationsError("CONFLICT", "This team member is already clocked in", 409);

      const branch = await db.branch.findUnique({
        where: { id: context.branch!.id },
        select: { latitude: true, longitude: true, geofenceRadiusMeters: true, lateGraceMinutes: true },
      });
      // The shift they are starting: the one covering now, or the next one today.
      const shift = await db.shift.findFirst({
        where: { staffId: staff.id, branchId: context.branch!.id, endsAt: { gt: clockIn } },
        orderBy: { startsAt: "asc" },
        select: { startsAt: true },
      });

      assessment = assessCheckIn({
        clockIn,
        shiftStart: shift?.startsAt ?? null,
        branch: {
          latitude: branch?.latitude === null || branch?.latitude === undefined ? null : Number(branch.latitude),
          longitude: branch?.longitude === null || branch?.longitude === undefined ? null : Number(branch.longitude),
          geofenceRadiusMeters: branch?.geofenceRadiusMeters ?? 150,
          lateGraceMinutes: branch?.lateGraceMinutes ?? 0,
        },
        location: parsed.data.latitude !== undefined && parsed.data.longitude !== undefined
          ? { latitude: parsed.data.latitude, longitude: parsed.data.longitude, accuracyMeters: parsed.data.accuracyMeters ?? null }
          : null,
      });
    }

    const status = assessment?.status ?? (parsed.data.action === "REQUEST_CORRECTION" ? "PENDING" : "APPROVED");
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
          // The reasons are written onto the record so the approvals queue can say *why* without
          // recomputing them from a geofence that may have moved since.
          note: "note" in parsed.data ? parsed.data.note : assessment?.reasons.join(" · ") || null,
          latitude: parsed.data.action === "CLOCK_IN" ? parsed.data.latitude ?? null : null,
          longitude: parsed.data.action === "CLOCK_IN" ? parsed.data.longitude ?? null : null,
          accuracyMeters: parsed.data.action === "CLOCK_IN" ? Math.round(parsed.data.accuracyMeters ?? 0) || null : null,
          distanceMeters: assessment?.distanceMeters ?? null,
          kind: assessment?.kind ?? "ON_SITE",
          lateMinutes: assessment?.lateMinutes ?? 0,
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
      const record = await tx.attendance.update({
        where: { id: existing.id },
        data: {
          status: parsed.data.status,
          note: parsed.data.note ?? existing.note,
          // Who signed off on a late or off-site day, and when. Attendance decides pay, so
          // "approved" without a name is not an answer anyone can stand behind later.
          reviewedById: context.user.id,
          reviewedAt: new Date(),
        },
      });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: parsed.data.status === "APPROVED" ? "ATTENDANCE_APPROVED" : "ATTENDANCE_REJECTED", entity: "Attendance", entityId: record.id, metadata: { branchId: context.branch!.id } } });
      return record;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
