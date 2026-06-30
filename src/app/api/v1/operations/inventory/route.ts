import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive(),
  type: z.enum(["PURCHASE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"]),
  reference: z.string().max(120).optional(),
  idempotencyKey: z.string().min(12).max(120),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid stock movement", 400, parsed.error.flatten());
    const context = await requireOperationsContext("inventory:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const existing = await db.stockMovement.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
    if (existing) return Response.json({ data: existing });
    const stock = await db.branchStock.findFirst({ where: { branchId: branch.id, inventoryItemId: parsed.data.inventoryItemId, inventoryItem: { tenantId: context.tenant.id } } });
    if (!stock) throw new OperationsError("NOT_FOUND", "Inventory item not found", 404);
    const delta = parsed.data.type === "ADJUSTMENT_OUT" ? -parsed.data.quantity : parsed.data.quantity;
    if (Number(stock.quantity) + delta < 0) throw new OperationsError("INSUFFICIENT_STOCK", "Stock cannot become negative", 409);
    const movement = await db.$transaction(async (tx) => {
      await tx.branchStock.update({
        where: { branchId_inventoryItemId: { branchId: branch.id, inventoryItemId: parsed.data.inventoryItemId } },
        data: { quantity: { increment: delta } },
      });
      return tx.stockMovement.create({
        data: { branchId: branch.id, inventoryItemId: parsed.data.inventoryItemId, type: parsed.data.type, quantity: delta, reference: parsed.data.reference, idempotencyKey: parsed.data.idempotencyKey },
      });
    });
    return Response.json({ data: movement }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
