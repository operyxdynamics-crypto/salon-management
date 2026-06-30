import { z } from "zod";
import { createAppointment } from "@/lib/availability";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional(),
  serviceLines: z.array(z.object({
    serviceId: z.string().min(1),
    staffId: z.string().min(1).nullable().optional(),
  })).min(1).optional(),
  startsAt: z.iso.datetime(),
  source: z.enum(["WALK_IN", "PHONE", "STAFF_CREATED"]).default("STAFF_CREATED"),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(12).max(120),
});

const querySchema = z.object({
  branchId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  view: z.enum(["day", "week"]).default("day"),
  staffId: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid appointment filters", 400, parsed.error.flatten());
    const context = await requireOperationsContext("appointment:read", { branchId: parsed.data.branchId, allowAll: true });
    const start = new Date(`${parsed.data.date}T00:00:00+05:30`);
    const end = new Date(start.getTime() + (parsed.data.view === "week" ? 7 : 1) * 86_400_000);
    const appointments = await db.appointment.findMany({
      where: {
        branchId: context.branch ? context.branch.id : { in: context.branches.map((branch) => branch.id) },
        staffId: context.user.role === "STYLIST" ? context.user.staff?.id : parsed.data.staffId || undefined,
        status: parsed.data.status ? parsed.data.status as never : undefined,
        source: parsed.data.source ? parsed.data.source as never : undefined,
        startsAt: { gte: start, lt: end },
      },
      include: {
        branch: true,
        customer: true,
        service: true,
        staff: { include: { user: true } },
        serviceLines: { include: { service: true, staff: { include: { user: true } } }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { startsAt: "asc" },
    });
    return Response.json({
      data: appointments.map((appointment) => ({
        id: appointment.id,
        branchId: appointment.branchId,
        branchName: appointment.branch.name,
        customerId: appointment.customerId,
        customer: appointment.customer.name,
        phone: appointment.customer.phone,
        serviceId: appointment.serviceId,
        service: appointment.service.name,
        staffId: appointment.staffId,
        staff: appointment.staff?.user.name ?? "Unassigned",
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        status: appointment.status,
        source: appointment.source,
        price: Number(appointment.service.price),
        serviceLines: appointment.serviceLines.map((line) => ({
          id: line.id,
          serviceId: line.serviceId,
          service: line.service.name,
          staffId: line.staffId,
          staff: line.staff?.user.name ?? "Unassigned",
          startsAt: line.startsAt?.toISOString() ?? appointment.startsAt.toISOString(),
          endsAt: line.endsAt?.toISOString() ?? appointment.endsAt.toISOString(),
          durationMinutes: line.durationMinutes,
          price: Number(line.price),
          taxRate: Number(line.taxRate),
        })),
      })),
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid appointment", 400, parsed.error.flatten());
    const context = await requireOperationsContext("appointment:write", { branchId: parsed.data.branchId, requireBranch: true });
    const appointment = await createAppointment({
      tenantId: context.tenant.id,
      branchId: context.branch!.id,
      customerId: parsed.data.customerId,
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId,
      startsAt: new Date(parsed.data.startsAt),
      source: parsed.data.source,
      notes: parsed.data.notes,
      idempotencyKey: parsed.data.idempotencyKey,
      actorId: context.user.id,
      serviceLines: parsed.data.serviceLines,
    });
    return Response.json({ data: appointment }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
