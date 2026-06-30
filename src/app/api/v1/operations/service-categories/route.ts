import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const createSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().trim().max(40).optional(),
  sortOrder: z.number().int().min(0).default(0),
  templateIds: z.array(z.string().min(1)).min(1).optional(),
}).refine((value) => Boolean(value.name || value.templateIds?.length), { message: "Provide a name or templates" });

export async function GET(request: Request) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId");
    if (!branchId) throw new OperationsError("VALIDATION", "Branch is required", 400);
    const context = await requireOperationsContext("branch:manage", { branchId, requireBranch: true });
    const [categories, templates] = await Promise.all([
      db.serviceCategory.findMany({
        where: { tenantId: context.tenant.id },
        include: { _count: { select: { services: true } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.serviceCategoryTemplate.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    ]);
    return Response.json({ data: { categories, templates } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid service category", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    const created = await db.$transaction(async (tx) => {
      const categories = [];
      if (parsed.data.templateIds?.length) {
        const templates = await tx.serviceCategoryTemplate.findMany({ where: { id: { in: parsed.data.templateIds }, isActive: true } });
        for (const template of templates) {
          categories.push(await tx.serviceCategory.upsert({
            where: { tenantId_name: { tenantId: context.tenant.id, name: template.name } },
            update: { isActive: true },
            create: {
              tenantId: context.tenant.id,
              copiedFromTemplateId: template.id,
              name: template.name,
              description: template.description,
              color: template.color,
              icon: template.icon,
              sortOrder: template.sortOrder,
            },
          }));
        }
      } else {
        categories.push(await tx.serviceCategory.create({
          data: {
            tenantId: context.tenant.id,
            name: parsed.data.name!,
            description: parsed.data.description,
            color: parsed.data.color,
            icon: parsed.data.icon,
            sortOrder: parsed.data.sortOrder,
          },
        }));
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: parsed.data.templateIds ? "SERVICE_CATEGORY_TEMPLATES_COPIED" : "SERVICE_CATEGORY_CREATED",
          entity: "ServiceCategory",
          metadata: { categoryIds: categories.map((category) => category.id), branchId: context.branch!.id },
        },
      });
      return categories;
    });
    return Response.json({ data: created }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
