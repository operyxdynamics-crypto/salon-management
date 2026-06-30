import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const lineSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).default(18),
});

const schema = z.object({
  branchId: z.string().min(1),
  vendorId: z.string().optional(),
  invoiceNumber: z.string().max(80).optional(),
  purchasedAt: z.iso.datetime(),
  note: z.string().max(300).optional(),
  lines: z.array(lineSchema).min(1),
  idempotencyKey: z.string().min(12).max(120),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid purchase entry", 400, parsed.error.flatten());
    const context = await requireOperationsContext("inventory:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const existing = await db.purchaseEntry.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey }, include: { lines: true } });
    if (existing) return Response.json({ data: existing });

    if (parsed.data.vendorId) {
      const vendor = await db.vendor.findFirst({ where: { id: parsed.data.vendorId, tenantId: context.tenant.id, isActive: true } });
      if (!vendor) throw new OperationsError("NOT_FOUND", "Vendor not found", 404);
    }
    const itemIds = parsed.data.lines.map((line) => line.inventoryItemId);
    const items = await db.inventoryItem.findMany({ where: { id: { in: itemIds }, tenantId: context.tenant.id, isActive: true } });
    if (items.length !== new Set(itemIds).size) throw new OperationsError("NOT_FOUND", "One or more products were not found", 404);

    const calculated = parsed.data.lines.map((line) => {
      const subtotal = line.quantity * line.unitCost;
      const tax = subtotal * line.taxRate / 100;
      return { ...line, total: Number((subtotal + tax).toFixed(2)) };
    });
    const subtotal = calculated.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const tax = calculated.reduce((sum, line) => sum + (line.quantity * line.unitCost * line.taxRate / 100), 0);
    const total = Number((subtotal + tax).toFixed(2));

    const purchase = await db.$transaction(async (tx) => {
      const entry = await tx.purchaseEntry.create({
        data: {
          tenantId: context.tenant.id,
          branchId: branch.id,
          vendorId: parsed.data.vendorId || null,
          invoiceNumber: parsed.data.invoiceNumber || null,
          purchasedAt: new Date(parsed.data.purchasedAt),
          note: parsed.data.note,
          subtotal,
          tax,
          total,
          idempotencyKey: parsed.data.idempotencyKey,
          lines: {
            create: calculated.map((line) => ({
              inventoryItemId: line.inventoryItemId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              taxRate: line.taxRate,
              total: line.total,
            })),
          },
        },
        include: { lines: true, vendor: true },
      });
      for (const line of calculated) {
        await tx.branchStock.upsert({
          where: { branchId_inventoryItemId: { branchId: branch.id, inventoryItemId: line.inventoryItemId } },
          update: { quantity: { increment: line.quantity } },
          create: { branchId: branch.id, inventoryItemId: line.inventoryItemId, quantity: line.quantity },
        });
        await tx.stockMovement.create({
          data: {
            branchId: branch.id,
            inventoryItemId: line.inventoryItemId,
            type: "PURCHASE",
            quantity: line.quantity,
            reference: entry.invoiceNumber ?? entry.id,
            idempotencyKey: `${parsed.data.idempotencyKey}-${line.inventoryItemId}`,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "PURCHASE_RECORDED",
          entity: "PurchaseEntry",
          entityId: entry.id,
          metadata: { total, lines: calculated.length },
        },
      });
      return entry;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ data: purchase }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
