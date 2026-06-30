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
  taxRate: z.number().min(0).max(100).default(18),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid service", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    await assertServiceCapacity(context.tenant.id);
    const { branchId, categoryId, ...serviceData } = parsed.data;
    const category = await db.serviceCategory.findFirst({ where: { id: categoryId, tenantId: context.tenant.id, isActive: true } });
    if (!category) throw new OperationsError("NOT_FOUND", "Service category not found", 404);
    const service = await db.service.create({
      data: {
        tenantId: context.tenant.id,
        ...serviceData,
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
