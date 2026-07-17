import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { createAppointment } from "@/lib/availability";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const recurrenceSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  interval: z.coerce.number().int().min(1).max(12).default(1),
  occurrences: z.coerce.number().int().min(2).max(30).default(2),
  endsAt: z.iso.datetime().optional(),
}).optional();

const schema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional(),
  resourceId: z.string().min(1).nullable().optional(),
  serviceLines: z.array(z.object({
    serviceId: z.string().min(1),
    staffId: z.string().min(1).nullable().optional(),
  })).min(1).optional(),
  startsAt: z.iso.datetime(),
  source: z.enum(["WALK_IN", "PHONE", "STAFF_CREATED"]).default("STAFF_CREATED"),
  status: z.enum(["CONFIRMED", "WAITLISTED"]).default("CONFIRMED"),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(12).max(120),
  recurrence: recurrenceSchema,
});

const querySchema = z.object({
  branchId: z.string().min(1),
  branchIds: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  view: z.enum(["day", "week"]).default("day"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  staffId: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
});

function addOccurrenceDate(value: Date, frequency: "DAILY" | "WEEKLY" | "MONTHLY", interval: number, index: number) {
  const next = new Date(value);
  if (frequency === "DAILY") next.setDate(next.getDate() + interval * index);
  if (frequency === "WEEKLY") next.setDate(next.getDate() + interval * 7 * index);
  if (frequency === "MONTHLY") next.setMonth(next.getMonth() + interval * index);
  return next;
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid appointment filters", 400, parsed.error.flatten());
    const requestedBranchIds = parsed.data.branchIds
      ? parsed.data.branchIds.split(",").map((value) => value.trim()).filter(Boolean)
      : null;
    const context = await requireOperationsContext("appointment:read", {
      branchId: requestedBranchIds?.length ? undefined : parsed.data.branchId,
      allowAll: true,
    });
    const selectedBranchIds = requestedBranchIds?.length
      ? context.branches.filter((branch) => requestedBranchIds.includes(branch.id)).map((branch) => branch.id)
      : null;
    if (requestedBranchIds?.length && selectedBranchIds?.length !== new Set(requestedBranchIds).size) {
      throw new OperationsError("FORBIDDEN", "You do not have access to one or more selected branches", 403);
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const listMode = Boolean(parsed.data.from || parsed.data.to || parsed.data.q || searchParams.has("page") || searchParams.has("pageSize"));
    const startDate = listMode ? parsed.data.from || parsed.data.date || today : parsed.data.date || today;
    const endDate = listMode ? parsed.data.to || startDate : startDate;
    const start = new Date(`${startDate}T00:00:00+05:30`);
    const end = listMode
      ? new Date(new Date(`${endDate}T00:00:00+05:30`).getTime() + 86_400_000)
      : new Date(start.getTime() + (parsed.data.view === "week" ? 7 : 1) * 86_400_000);
    const search = parsed.data.q?.trim();
    const branchWhere = selectedBranchIds?.length
      ? { in: selectedBranchIds }
      : context.branch
        ? context.branch.id
        : { in: context.branches.map((branch) => branch.id) };
    const where: Prisma.AppointmentWhereInput = {
      branchId: branchWhere,
      staffId: context.user.role === "STYLIST" ? context.user.staff?.id : parsed.data.staffId || undefined,
      status: parsed.data.status ? parsed.data.status as never : undefined,
      source: parsed.data.source ? parsed.data.source as never : undefined,
      startsAt: { gte: start, lt: end },
      OR: search ? [
        { id: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search } } },
        { service: { name: { contains: search, mode: "insensitive" } } },
      ] : undefined,
    };
    const [appointments, appointmentTotal, blockedTimes] = await Promise.all([
      db.appointment.findMany({
      where,
      include: {
        branch: true,
        customer: true,
        service: true,
        staff: { include: { user: true } },
        resource: true,
        invoice: { include: { payments: true } },
        serviceLines: { include: { service: true, staff: { include: { user: true } } }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { startsAt: "asc" },
      skip: listMode ? (parsed.data.page - 1) * parsed.data.pageSize : undefined,
      take: listMode ? parsed.data.pageSize : undefined,
      }),
      listMode ? db.appointment.count({ where }) : Promise.resolve(0),
      db.blockedTime.findMany({
        where: {
          branchId: branchWhere,
          OR: context.user.role === "STYLIST"
            ? [{ staffId: context.user.staff?.id }, { staffId: null }]
            : parsed.data.staffId
              ? [{ staffId: parsed.data.staffId }, { staffId: null }]
              : undefined,
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        include: { branch: true, staff: { include: { user: true } }, resource: true },
        orderBy: { startsAt: "asc" },
      }),
    ]);
    return Response.json({
      data: {
        appointments: appointments.map((appointment) => ({
        id: appointment.id,
        bookingReference: appointment.id,
        branchId: appointment.branchId,
        branchName: appointment.branch.name,
        customerId: appointment.customerId,
        customer: appointment.customer.name,
        phone: appointment.customer.phone,
        customerNotes: appointment.customer.notes,
        customerAllergies: appointment.customer.allergies,
        serviceId: appointment.serviceId,
        service: appointment.service.name,
        staffId: appointment.staffId,
        staff: appointment.staff?.user.name ?? "Unassigned",
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        status: appointment.status,
        source: appointment.source,
        notes: appointment.notes,
        cancellationReason: appointment.cancellationReason,
        resourceId: appointment.resourceId,
        resourceName: appointment.resource?.name ?? null,
        price: Number(appointment.service.price),
        invoice: appointment.invoice ? {
          id: appointment.invoice.id,
          number: appointment.invoice.number,
          status: appointment.invoice.status,
          total: Number(appointment.invoice.total),
          paid: appointment.invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
          outstanding: Math.max(0, Number(appointment.invoice.total) - appointment.invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)),
        } : null,
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
          priceTaxMode: line.priceTaxMode,
        })),
        })),
        blockedTimes: blockedTimes.map((block) => ({
          id: block.id,
          branchId: block.branchId,
          branchName: block.branch.name,
          staffId: block.staffId,
          staffName: block.staff?.user.name ?? null,
          resourceId: block.resourceId,
          resourceName: block.resource?.name ?? null,
          title: block.title,
          reason: block.reason,
          startsAt: block.startsAt.toISOString(),
          endsAt: block.endsAt.toISOString(),
          isAllDay: block.isAllDay,
        })),
        pagination: listMode ? {
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
          total: appointmentTotal,
          pages: Math.max(1, Math.ceil(appointmentTotal / parsed.data.pageSize)),
        } : null,
      },
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
    const recurrence = parsed.data.recurrence;
    if (recurrence) {
      const duplicateFirst = await db.appointment.findUnique({ where: { idempotencyKey: `${parsed.data.idempotencyKey}-0` } });
      if (duplicateFirst?.seriesId) {
        const existing = await db.appointment.findMany({ where: { seriesId: duplicateFirst.seriesId }, orderBy: { startsAt: "asc" } });
        return Response.json({ data: existing }, { status: 200 });
      }
      let seriesId: string | null = null;
      try {
        const series = await db.appointmentSeries.create({
          data: {
            tenantId: context.tenant.id,
            frequency: recurrence.frequency,
            interval: recurrence.interval,
            occurrences: recurrence.occurrences,
            endsAt: recurrence.endsAt ? new Date(recurrence.endsAt) : null,
          },
        });
        seriesId = series.id;
        const starts = Array.from({ length: recurrence.occurrences }, (_, index) => addOccurrenceDate(new Date(parsed.data.startsAt), recurrence.frequency, recurrence.interval, index))
          .filter((startsAt) => !recurrence.endsAt || startsAt <= new Date(recurrence.endsAt!));
        const created = [];
        for (let index = 0; index < starts.length; index += 1) {
          created.push(await createAppointment({
            tenantId: context.tenant.id,
            branchId: context.branch!.id,
            customerId: parsed.data.customerId,
            serviceId: parsed.data.serviceId,
            staffId: parsed.data.staffId,
            resourceId: parsed.data.resourceId,
            startsAt: starts[index],
            source: parsed.data.source,
            status: parsed.data.status,
            notes: parsed.data.notes,
            idempotencyKey: `${parsed.data.idempotencyKey}-${index}`,
            actorId: context.user.id,
            serviceLines: parsed.data.serviceLines,
            seriesId,
          }));
        }
        return Response.json({ data: created }, { status: 201 });
      } catch (error) {
        if (seriesId) {
          await db.appointment.deleteMany({ where: { seriesId } }).catch(() => null);
          await db.appointmentSeries.delete({ where: { id: seriesId } }).catch(() => null);
        }
        throw error;
      }
    }
    const appointment = await createAppointment({
      tenantId: context.tenant.id,
      branchId: context.branch!.id,
      customerId: parsed.data.customerId,
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId,
      resourceId: parsed.data.resourceId,
      startsAt: new Date(parsed.data.startsAt),
      source: parsed.data.source,
      status: parsed.data.status,
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
