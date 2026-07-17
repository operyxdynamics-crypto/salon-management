import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2).max(120),
  sku: z.string().min(2).max(80),
  category: z.string().min(2).max(80),
  unit: z.string().min(1).max(30),
  retailPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative(),
  taxClassId: z.string().optional(),
  taxRate: z.number().min(0).max(100).default(18),
  priceTaxMode: z.enum(["EXCLUSIVE", "INCLUSIVE"]).default("EXCLUSIVE"),
  reorderLevel: z.number().nonnegative(),
  openingQuantity: z.number().nonnegative().default(0),
  vendorId: z.string().optional(),
  idempotencyKey: z.string().min(12).max(120),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid product", 400, parsed.error.flatten());
    const context = await requireOperationsContext("inventory:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const vendor = parsed.data.vendorId
      ? await db.vendor.findFirst({ where: { id: parsed.data.vendorId, tenantId: context.tenant.id, isActive: true } })
      : null;
    if (parsed.data.vendorId && !vendor) throw new OperationsError("NOT_FOUND", "Vendor not found", 404);

    // The Tax master is authoritative: a chosen class sets the rate, so a product cannot drift from
    // the percentage defined once in the master.
    let taxRate = parsed.data.taxRate;
    if (parsed.data.taxClassId) {
      const taxClass = await db.taxClass.findFirst({ where: { id: parsed.data.taxClassId, tenantId: context.tenant.id, isActive: true } });
      if (!taxClass) throw new OperationsError("NOT_FOUND", "Tax class not found", 404);
      taxRate = Number(taxClass.rate);
    }

    const product = await db.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          tenantId: context.tenant.id,
          name: parsed.data.name,
          sku: parsed.data.sku.trim(),
          category: parsed.data.category,
          unit: parsed.data.unit,
          retailPrice: parsed.data.retailPrice,
          costPrice: parsed.data.costPrice,
          taxRate,
          taxClassId: parsed.data.taxClassId || null,
          priceTaxMode: parsed.data.priceTaxMode,
          reorderLevel: parsed.data.reorderLevel,
          vendorId: vendor?.id,
          branchStock: { create: { branchId: branch.id, quantity: parsed.data.openingQuantity } },
        },
      });
      if (parsed.data.openingQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            branchId: branch.id,
            inventoryItemId: item.id,
            type: "OPENING_STOCK",
            quantity: parsed.data.openingQuantity,
            reference: parsed.data.idempotencyKey,
            idempotencyKey: `${parsed.data.idempotencyKey}-opening`,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "PRODUCT_CREATED",
          entity: "InventoryItem",
          entityId: item.id,
          metadata: { sku: item.sku, openingQuantity: parsed.data.openingQuantity },
        },
      });
      return item;
    });
    return Response.json({ data: product }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
