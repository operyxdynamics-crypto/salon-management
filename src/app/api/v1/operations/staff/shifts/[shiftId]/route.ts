import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  idempotencyKey: z.string().min(12).max(120),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid shift update", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    const { shiftId } = await params;
    const shift = await db.shift.findFirst({ where: { id: shiftId, branchId: context.branch!.id } });
    if (!shift) throw new OperationsError("NOT_FOUND", "Shift not found", 404);
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    const conflict = await db.shift.findFirst({
      where: { id: { not: shift.id }, staffId: shift.staffId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    });
    if (conflict) throw new OperationsError("CONFLICT", "This shift overlaps another shift", 409);
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.shift.update({ where: { id: shift.id }, data: { startsAt, endsAt } });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "SHIFT_MOVED", entity: "Shift", entityId: shift.id, metadata: { idempotencyKey: parsed.data.idempotencyKey } } });
      return result;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
