import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { assertServiceCapacity } from "@/lib/plan-limits";

const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2).max(120),
  categoryId: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(480),
  price: z.number().positive(),
  taxClassId: z.string().optional(),
  taxRate: z.number().min(0).max(100).default(18),
  priceTaxMode: z.enum(["EXCLUSIVE", "INCLUSIVE"]).default("EXCLUSIVE"),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid service", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    await assertServiceCapacity(context.tenant.id);
    const { branchId, categoryId, taxClassId, ...serviceData } = parsed.data;
    const category = await db.serviceCategory.findFirst({ where: { id: categoryId, tenantId: context.tenant.id, isActive: true } });
    if (!category) throw new OperationsError("NOT_FOUND", "Service category not found", 404);
    // The Tax master is the source of truth: if a class is chosen, its rate wins over any rate the
    // client sent, so a service can never drift from the percentage defined in the master.
    let taxRate = serviceData.taxRate;
    if (taxClassId) {
      const taxClass = await db.taxClass.findFirst({ where: { id: taxClassId, tenantId: context.tenant.id, isActive: true } });
      if (!taxClass) throw new OperationsError("NOT_FOUND", "Tax class not found", 404);
      taxRate = Number(taxClass.rate);
    }
    const service = await db.service.create({
      data: {
        tenantId: context.tenant.id,
        ...serviceData,
        taxRate,
        taxClassId: taxClassId || null,
        category: category.name,
        categoryId: category.id,
        branches: { create: { branchId, isActive: true } },
      },
    });
    return Response.json({ data: service }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
