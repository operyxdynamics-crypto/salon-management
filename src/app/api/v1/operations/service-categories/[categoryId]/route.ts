import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid service category", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    const { categoryId } = await params;
    const existing = await db.serviceCategory.findFirst({ where: { id: categoryId, tenantId: context.tenant.id } });
    if (!existing) throw new OperationsError("NOT_FOUND", "Service category not found", 404);
    const { branchId, ...data } = parsed.data;
    void branchId;
    const category = await db.serviceCategory.update({ where: { id: categoryId }, data });
    await db.auditLog.create({
      data: { userId: context.user.id, tenantId: context.tenant.id, action: "SERVICE_CATEGORY_UPDATED", entity: "ServiceCategory", entityId: category.id },
    });
    return Response.json({ data: category });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
