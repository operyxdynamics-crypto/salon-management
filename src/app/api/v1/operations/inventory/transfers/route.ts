import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  toBranchId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive(),
  note: z.string().max(300).optional(),
  idempotencyKey: z.string().min(12).max(120),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid transfer", 400, parsed.error.flatten());
    const context = await requireOperationsContext("inventory:write", { branchId: parsed.data.branchId, requireBranch: true });
    const fromBranch = context.branch!;
    if (fromBranch.id === parsed.data.toBranchId) throw new OperationsError("VALIDATION", "Choose a different destination branch", 400);
    const toBranch = context.branches.find((branch) => branch.id === parsed.data.toBranchId);
    if (!toBranch) throw new OperationsError("FORBIDDEN", "You do not have access to the destination branch", 403);
    const existing = await db.stockTransfer.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
    if (existing) return Response.json({ data: existing });
    const item = await db.inventoryItem.findFirst({ where: { id: parsed.data.inventoryItemId, tenantId: context.tenant.id, isActive: true } });
    if (!item) throw new OperationsError("NOT_FOUND", "Product not found", 404);

    const transfer = await db.$transaction(async (tx) => {
      const changed = await tx.branchStock.updateMany({
        where: { branchId: fromBranch.id, inventoryItemId: item.id, quantity: { gte: parsed.data.quantity } },
        data: { quantity: { decrement: parsed.data.quantity } },
      });
      if (changed.count !== 1) throw new OperationsError("INSUFFICIENT_STOCK", "Source branch has insufficient stock", 409);
      await tx.branchStock.upsert({
        where: { branchId_inventoryItemId: { branchId: toBranch.id, inventoryItemId: item.id } },
        update: { quantity: { increment: parsed.data.quantity } },
        create: { branchId: toBranch.id, inventoryItemId: item.id, quantity: parsed.data.quantity },
      });
      const created = await tx.stockTransfer.create({
        data: {
          tenantId: context.tenant.id,
          inventoryItemId: item.id,
          fromBranchId: fromBranch.id,
          toBranchId: toBranch.id,
          quantity: parsed.data.quantity,
          note: parsed.data.note,
          idempotencyKey: parsed.data.idempotencyKey,
        },
      });
      await tx.stockMovement.createMany({
        data: [
          { branchId: fromBranch.id, inventoryItemId: item.id, type: "TRANSFER_OUT", quantity: -parsed.data.quantity, reference: created.id, idempotencyKey: `${parsed.data.idempotencyKey}-out` },
          { branchId: toBranch.id, inventoryItemId: item.id, type: "TRANSFER_IN", quantity: parsed.data.quantity, reference: created.id, idempotencyKey: `${parsed.data.idempotencyKey}-in` },
        ],
      });
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "STOCK_TRANSFERRED",
          entity: "StockTransfer",
          entityId: created.id,
          metadata: { fromBranchId: fromBranch.id, toBranchId: toBranch.id, quantity: parsed.data.quantity },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ data: transfer }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
