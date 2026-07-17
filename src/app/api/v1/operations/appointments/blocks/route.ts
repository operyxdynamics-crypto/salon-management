import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const listSchema = z.object({
  branchId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createSchema = z.object({
  branchId: z.string().min(1),
  staffId: z.string().min(1).nullable().optional(),
  resourceId: z.string().min(1).nullable().optional(),
  title: z.string().min(2).max(120),
  reason: z.string().max(250).nullable().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  isAllDay: z.boolean().default(false),
  idempotencyKey: z.string().min(12).max(120).optional(),
});

function toDto(block: {
  id: string;
  branchId: string;
  branch: { name: string };
  staffId: string | null;
  staff: null | { user: { name: string } };
  resourceId: string | null;
  resource: null | { name: string };
  title: string;
  reason: string | null;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
}) {
  return {
    id: block.id,
    branchId: block.branchId,
    branchName: block.branch.name,
    staffId: block.staffId,
    staffName: block.staff?.user.name ?? null,
    resourceId: block.resourceId,
    resourceName: block.resource?.name ?? null,
    title: block.title,
    reason: block.reason,
    startsAt: block.startsAt.toISOString(),
    endsAt: block.endsAt.toISOString(),
    isAllDay: block.isAllDay,
  };
}

export async function GET(request: Request) {
  try {
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid blocked-time filters", 400, parsed.error.flatten());
    const context = await requireOperationsContext("appointment:read", { branchId: parsed.data.branchId, requireBranch: true });
    const start = parsed.data.date ? new Date(`${parsed.data.date}T00:00:00+05:30`) : new Date(Date.now() - 86_400_000);
    const end = parsed.data.date ? new Date(start.getTime() + 86_400_000) : new Date(Date.now() + 30 * 86_400_000);
    const blocks = await db.blockedTime.findMany({
      where: { branchId: context.branch!.id, startsAt: { lt: end }, endsAt: { gt: start } },
      include: { branch: true, staff: { include: { user: true } }, resource: true },
      orderBy: { startsAt: "asc" },
    });
    return Response.json({ data: blocks.map(toDto) });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid blocked time", 400, parsed.error.flatten());
    const context = await requireOperationsContext("appointment:write", { branchId: parsed.data.branchId, requireBranch: true });
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new OperationsError("VALIDATION", "Blocked time end must be after start", 400);
    }
    if (parsed.data.staffId) {
      const staff = await db.staff.findFirst({
        where: {
          id: parsed.data.staffId,
          user: { tenantId: context.tenant.id, isActive: true },
          OR: [{ branchId: context.branch!.id }, { branchAssignments: { some: { branchId: context.branch!.id } } }],
        },
      });
      if (!staff) throw new OperationsError("NOT_FOUND", "Staff member is not assigned to this branch", 404);
    }
    if (parsed.data.resourceId) {
      const resource = await db.resource.findFirst({ where: { id: parsed.data.resourceId, branchId: context.branch!.id } });
      if (!resource) throw new OperationsError("NOT_FOUND", "Resource is not assigned to this branch", 404);
    }
    const block = await db.blockedTime.create({
      data: {
        branchId: context.branch!.id,
        staffId: parsed.data.staffId || null,
        resourceId: parsed.data.resourceId || null,
        createdById: context.user.id,
        title: parsed.data.title,
        reason: parsed.data.reason || null,
        startsAt,
        endsAt,
        isAllDay: parsed.data.isAllDay,
      },
      include: { branch: true, staff: { include: { user: true } }, resource: true },
    });
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "APPOINTMENT_BLOCK_CREATED",
        entity: "BlockedTime",
        entityId: block.id,
        metadata: { idempotencyKey: parsed.data.idempotencyKey, staffId: block.staffId, resourceId: block.resourceId },
      },
    });
    return Response.json({ data: toDto(block) }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
