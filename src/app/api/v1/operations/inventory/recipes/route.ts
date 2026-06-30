import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid consumption recipe", 400, parsed.error.flatten());
    const context = await requireOperationsContext("inventory:write", { branchId: parsed.data.branchId, requireBranch: true });
    const [service, item] = await Promise.all([
      db.service.findFirst({ where: { id: parsed.data.serviceId, tenantId: context.tenant.id, isActive: true } }),
      db.inventoryItem.findFirst({ where: { id: parsed.data.inventoryItemId, tenantId: context.tenant.id, isActive: true } }),
    ]);
    if (!service) throw new OperationsError("NOT_FOUND", "Service not found", 404);
    if (!item) throw new OperationsError("NOT_FOUND", "Product not found", 404);
    const recipe = await db.serviceConsumptionRecipe.upsert({
      where: { serviceId_inventoryItemId: { serviceId: service.id, inventoryItemId: item.id } },
      update: { quantity: parsed.data.quantity, isActive: true },
      create: {
        tenantId: context.tenant.id,
        serviceId: service.id,
        inventoryItemId: item.id,
        quantity: parsed.data.quantity,
      },
    });
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "SERVICE_CONSUMPTION_SAVED",
        entity: "ServiceConsumptionRecipe",
        entityId: recipe.id,
        metadata: { serviceId: service.id, inventoryItemId: item.id, quantity: parsed.data.quantity },
      },
    });
    return Response.json({ data: recipe }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
