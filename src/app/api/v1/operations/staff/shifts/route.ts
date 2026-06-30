import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  staffId: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  type: z.enum(["REGULAR", "OVERTIME", "TRAINING"]).default("REGULAR"),
  idempotencyKey: z.string().min(12).max(120),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid shift", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (endsAt <= startsAt) throw new OperationsError("VALIDATION", "Shift end must be after its start", 400);
    const staff = await db.staff.findFirst({
      where: {
        id: parsed.data.staffId,
        user: { tenantId: context.tenant.id, isActive: true },
        OR: [{ branchId: context.branch!.id }, { branchAssignments: { some: { branchId: context.branch!.id } } }],
      },
    });
    if (!staff) throw new OperationsError("NOT_FOUND", "Team member not found at this branch", 404);
    const conflict = await db.shift.findFirst({
      where: { staffId: staff.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    });
    if (conflict) throw new OperationsError("CONFLICT", "This shift overlaps another shift", 409);
    const shift = await db.$transaction(async (tx) => {
      const created = await tx.shift.create({ data: { branchId: context.branch!.id, staffId: staff.id, startsAt, endsAt, type: parsed.data.type } });
      await tx.auditLog.create({
        data: { userId: context.user.id, tenantId: context.tenant.id, action: "SHIFT_CREATED", entity: "Shift", entityId: created.id, metadata: { idempotencyKey: parsed.data.idempotencyKey } },
      });
      return created;
    });
    return Response.json({ data: shift }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
