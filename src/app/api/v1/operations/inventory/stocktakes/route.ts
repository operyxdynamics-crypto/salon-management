import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  countedAt: z.iso.datetime(),
  note: z.string().max(300).optional(),
  lines: z.array(z.object({
    inventoryItemId: z.string().min(1),
    countedQty: z.number().nonnegative(),
  })).min(1),
  idempotencyKey: z.string().min(12).max(120),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid stocktake", 400, parsed.error.flatten());
    const context = await requireOperationsContext("inventory:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const existing = await db.stocktake.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey }, include: { lines: true } });
    if (existing) return Response.json({ data: existing });
    const itemIds = parsed.data.lines.map((line) => line.inventoryItemId);
    const stocks = await db.branchStock.findMany({
      where: { branchId: branch.id, inventoryItemId: { in: itemIds }, inventoryItem: { tenantId: context.tenant.id, isActive: true } },
      include: { inventoryItem: true },
    });
    if (stocks.length !== new Set(itemIds).size) throw new OperationsError("NOT_FOUND", "One or more products were not found in this branch", 404);
    const stockMap = new Map(stocks.map((stock) => [stock.inventoryItemId, Number(stock.quantity)]));

    const stocktake = await db.$transaction(async (tx) => {
      const created = await tx.stocktake.create({
        data: {
          tenantId: context.tenant.id,
          branchId: branch.id,
          countedAt: new Date(parsed.data.countedAt),
          note: parsed.data.note,
          idempotencyKey: parsed.data.idempotencyKey,
        },
      });
      for (const line of parsed.data.lines) {
        const expectedQty = stockMap.get(line.inventoryItemId) ?? 0;
        const varianceQty = Number((line.countedQty - expectedQty).toFixed(2));
        await tx.stocktakeLine.create({
          data: { stocktakeId: created.id, inventoryItemId: line.inventoryItemId, expectedQty, countedQty: line.countedQty, varianceQty },
        });
        if (varianceQty !== 0) {
          await tx.branchStock.update({
            where: { branchId_inventoryItemId: { branchId: branch.id, inventoryItemId: line.inventoryItemId } },
            data: { quantity: line.countedQty },
          });
          await tx.stockMovement.create({
            data: {
              branchId: branch.id,
              inventoryItemId: line.inventoryItemId,
              type: "STOCKTAKE",
              quantity: varianceQty,
              reference: created.id,
              idempotencyKey: `${parsed.data.idempotencyKey}-${line.inventoryItemId}`,
            },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "STOCKTAKE_RECORDED",
          entity: "Stocktake",
          entityId: created.id,
          metadata: { lines: parsed.data.lines.length },
        },
      });
      return tx.stocktake.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ data: stocktake }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
