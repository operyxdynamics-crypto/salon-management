import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  categoryId: z.string().min(1).optional(),
  price: z.number().positive(),
  durationMinutes: z.number().int().min(15).max(480),
  taxRate: z.number().min(0).max(100),
  priceTaxMode: z.enum(["EXCLUSIVE", "INCLUSIVE"]),
  isActive: z.boolean(),
  onlineBooking: z.boolean().optional(),
  bufferBefore: z.number().int().min(0).max(180).optional(),
  bufferAfter: z.number().int().min(0).max(180).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId") ?? "all";
    const context = await requireOperationsContext("service:read", { branchId, allowAll: true });
    const { serviceId } = await params;
    const branchIds = context.branch ? [context.branch.id] : context.branches.map((branch) => branch.id);
    const service = await db.service.findFirst({
      where: { id: serviceId, tenantId: context.tenant.id },
      include: {
        categoryRecord: true,
        branches: { where: { branchId: { in: branchIds } }, include: { branch: true }, orderBy: { branch: { name: "asc" } } },
        staff: {
          include: {
            staff: {
              include: {
                user: true,
                branch: true,
                branchAssignments: { include: { branch: true } },
              },
            },
          },
        },
      },
    });
    if (!service) throw new OperationsError("NOT_FOUND", "Service not found", 404);
    const appointments = await db.appointmentServiceLine.findMany({
      where: { serviceId, appointment: { branchId: { in: branchIds } } },
      include: {
        appointment: { include: { branch: true, customer: true } },
        staff: { include: { user: true } },
      },
      orderBy: { appointment: { startsAt: "desc" } },
      take: 50,
    });
    const invoiceLines = await db.invoiceLine.findMany({
      where: { serviceId, invoice: { branchId: { in: branchIds } } },
      select: { total: true, quantity: true },
    });
    const legacyAppointments = appointments.length ? [] : await db.appointment.findMany({
      where: { serviceId, branchId: { in: branchIds } },
      include: { branch: true, customer: true, staff: { include: { user: true } } },
      orderBy: { startsAt: "desc" },
      take: 50,
    });
    const statuses = appointments.length
      ? appointments.map((line) => line.appointment.status)
      : legacyAppointments.map((appointment) => appointment.status);
    const soldQuantity = invoiceLines.reduce((sum, line) => sum + Number(line.quantity), 0);
    const revenue = invoiceLines.reduce((sum, line) => sum + Number(line.total), 0);
    return Response.json({
      data: {
        service: {
          id: service.id,
          name: service.name,
          category: service.categoryRecord?.name ?? service.category,
          categoryId: service.categoryId,
          description: service.description,
          durationMinutes: service.durationMinutes,
          price: Number(service.price),
          taxRate: Number(service.taxRate),
          priceTaxMode: service.priceTaxMode,
          isActive: service.isActive,
          onlineBooking: service.onlineBooking,
          bufferBefore: service.bufferBefore,
          bufferAfter: service.bufferAfter,
          sortOrder: service.sortOrder,
        },
        branchOverrides: service.branches.map((override) => ({
          branchId: override.branchId,
          branchName: override.branch.name,
          isActive: override.isActive,
          price: Number(override.price ?? service.price),
          durationMinutes: override.durationMinutes ?? service.durationMinutes,
          taxRate: Number(override.taxRate ?? service.taxRate),
          priceTaxMode: override.priceTaxMode ?? service.priceTaxMode,
        })),
        qualifiedStaff: service.staff
          .filter(({ staff }) => {
            const assignedIds = new Set([staff.branchId, ...staff.branchAssignments.map((assignment) => assignment.branchId)]);
            return branchIds.some((id) => assignedIds.has(id));
          })
          .map(({ staff }) => ({
            id: staff.id,
            name: staff.user.name,
            role: staff.jobTitle,
            branchNames: [...new Map([staff.branch, ...staff.branchAssignments.map((assignment) => assignment.branch)].map((branch) => [branch.id, branch.name])).values()],
          })),
        metrics: {
          bookings: statuses.length,
          completed: statuses.filter((status) => status === "COMPLETED").length,
          cancelled: statuses.filter((status) => status === "CANCELLED").length,
          noShows: statuses.filter((status) => status === "NO_SHOW").length,
          averageSellingPrice: soldQuantity ? revenue / soldQuantity : 0,
          revenue,
        },
        appointments: appointments.length
          ? appointments.map((line) => ({
            id: line.appointmentId,
            branchName: line.appointment.branch.name,
            customerName: line.appointment.customer.name,
            staffName: line.staff?.user.name ?? "Unassigned",
            startsAt: line.appointment.startsAt.toISOString(),
            status: line.appointment.status,
            price: Number(line.price),
          }))
          : legacyAppointments.map((appointment) => ({
            id: appointment.id,
            branchName: appointment.branch.name,
            customerName: appointment.customer.name,
            staffName: appointment.staff?.user.name ?? "Unassigned",
            startsAt: appointment.startsAt.toISOString(),
            status: appointment.status,
            price: Number(service.price),
          })),
        permissions: { canEdit: context.permissions.has("master:write") },
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid branch service settings", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    const { serviceId } = await params;
    const settings = {
      price: parsed.data.price,
      durationMinutes: parsed.data.durationMinutes,
      taxRate: parsed.data.taxRate,
      priceTaxMode: parsed.data.priceTaxMode,
      isActive: parsed.data.isActive,
    };
    const service = await db.service.findFirst({ where: { id: serviceId, tenantId: context.tenant.id } });
    if (!service) throw new OperationsError("NOT_FOUND", "Service not found", 404);
    const category = parsed.data.categoryId
      ? await db.serviceCategory.findFirst({ where: { id: parsed.data.categoryId, tenantId: context.tenant.id, isActive: true } })
      : null;
    if (parsed.data.categoryId && !category) throw new OperationsError("NOT_FOUND", "Service category not found", 404);
    const override = await db.$transaction(async (tx) => {
      await tx.service.update({
        where: { id: serviceId },
        data: {
          name: parsed.data.name,
          categoryId: category?.id,
          category: category?.name,
          onlineBooking: parsed.data.onlineBooking,
          bufferBefore: parsed.data.bufferBefore,
          bufferAfter: parsed.data.bufferAfter,
          sortOrder: parsed.data.sortOrder,
        },
      });
      return tx.branchService.upsert({
        where: { branchId_serviceId: { branchId: context.branch!.id, serviceId } },
        update: settings,
        create: { branchId: context.branch!.id, serviceId, ...settings },
      });
    });
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "BRANCH_SERVICE_UPDATED",
        entity: "BranchService",
        entityId: `${context.branch!.id}:${serviceId}`,
      },
    });
    return Response.json({ data: override });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
