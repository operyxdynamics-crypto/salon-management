import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({ branchId: z.string().min(1) });

export async function GET(request: Request) {
  try {
    const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid branch", 400, parsed.error.flatten());
    const context = await requireOperationsContext("appointment:read", { branchId: parsed.data.branchId, requireBranch: true });
    const [branch, services, categories, staff, resources] = await Promise.all([
      db.branch.findUnique({
        where: { id: context.branch!.id },
        include: { operatingHours: { orderBy: { dayOfWeek: "asc" } } },
      }),
      db.service.findMany({
        where: { tenantId: context.tenant.id, isActive: true },
        include: { categoryRecord: true, branches: { where: { branchId: context.branch!.id } } },
        orderBy: [{ categoryRecord: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      }),
      db.serviceCategory.findMany({
        where: { tenantId: context.tenant.id, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.staff.findMany({
        where: {
          user: { tenantId: context.tenant.id, isActive: true },
          OR: [{ branchId: context.branch!.id }, { branchAssignments: { some: { branchId: context.branch!.id } } }],
        },
        include: { user: true, services: true },
        orderBy: { user: { name: "asc" } },
      }),
      db.resource.findMany({
        where: { branchId: context.branch!.id },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      }),
    ]);
    if (!branch) throw new OperationsError("NOT_FOUND", "Branch not found", 404);
    return Response.json({
      data: {
        branch: {
          id: branch.id,
          name: branch.name,
          timezone: branch.timezone,
          operatingHours: branch.operatingHours,
        },
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          sortOrder: category.sortOrder,
        })),
        services: services.flatMap((service) => {
          const override = service.branches[0];
          if (override?.isActive === false) return [];
          return [{
            id: service.id,
            name: service.name,
            category: service.categoryRecord?.name ?? service.category,
            categoryId: service.categoryId,
            durationMinutes: override?.durationMinutes ?? service.durationMinutes,
            price: Number(override?.price ?? service.price),
            taxRate: Number(override?.taxRate ?? service.taxRate),
            priceTaxMode: override?.priceTaxMode ?? service.priceTaxMode,
            isActive: true,
          }];
        }),
        staff: staff.map((member) => ({
          id: member.id,
          name: member.user.name,
          role: member.jobTitle,
          serviceIds: member.services.map((service) => service.serviceId),
        })),
        resources: resources.map((resource) => ({
          id: resource.id,
          name: resource.name,
          type: resource.type,
        })),
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
