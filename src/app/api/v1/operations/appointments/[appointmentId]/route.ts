import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { findAvailableStaff, resolveBranchService, resourceIsAvailable } from "@/lib/availability";

const schema = z.object({
  customerId: z.string().min(1).optional(),
  status: z.enum(["WAITLISTED", "CONFIRMED", "CHECKED_IN", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  startsAt: z.iso.datetime().optional(),
  staffId: z.string().nullable().optional(),
  resourceId: z.string().nullable().optional(),
  source: z.enum(["MARKETPLACE", "SALON_WEBSITE", "PHONE", "WALK_IN", "STAFF_CREATED"]).optional(),
  serviceLines: z.array(z.object({
    serviceId: z.string().min(1),
    staffId: z.string().min(1).nullable().optional(),
    durationMinutes: z.coerce.number().int().min(5).max(720).optional(),
    price: z.coerce.number().min(0).max(999999).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    priceTaxMode: z.enum(["EXCLUSIVE", "INCLUSIVE"]).optional(),
  })).min(1).optional(),
  notes: z.string().max(500).optional(),
  cancellationReason: z.string().max(250).optional(),
  idempotencyKey: z.string().min(12).max(120),
});

const transitions: Record<string, string[]> = {
  WAITLISTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW", "WAITLISTED"],
  CHECKED_IN: ["IN_SERVICE", "CANCELLED"],
  IN_SERVICE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export async function GET(_request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  try {
    const { appointmentId } = await params;
    const appointmentBranch = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: { branchId: true },
    });
    if (!appointmentBranch) throw new OperationsError("NOT_FOUND", "Appointment not found", 404);
    const context = await requireOperationsContext("appointment:read", { branchId: appointmentBranch.branchId, requireBranch: true });
    const appointment = await db.appointment.findFirst({
      where: {
        id: appointmentId,
        branch: { tenantId: context.tenant.id },
      },
      include: {
        branch: true,
        customer: {
          include: {
            appointments: {
              where: {
                branchId: { in: context.branches.map((branch) => branch.id) },
                status: "COMPLETED",
              },
              select: { id: true },
            },
            loyaltyLedger: { select: { points: true } },
          },
        },
        service: true,
        staff: { include: { user: true } },
        resource: true,
        serviceLines: {
          include: { service: true, staff: { include: { user: true } } },
          orderBy: { sortOrder: "asc" },
        },
        invoice: { include: { payments: true } },
        review: true,
        statusHistory: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!appointment) throw new OperationsError("NOT_FOUND", "Appointment not found", 404);
    if (
      context.user.role === "STYLIST"
      && appointment.staffId !== context.user.staff?.id
      && !appointment.serviceLines.some((line) => line.staffId === context.user.staff?.id)
    ) {
      throw new OperationsError("FORBIDDEN", "You can only view appointments assigned to you", 403);
    }
    const serviceLines = appointment.serviceLines.length
      ? appointment.serviceLines
      : [{
        id: `legacy-${appointment.id}`,
        serviceId: appointment.serviceId,
        service: appointment.service,
        staffId: appointment.staffId,
        staff: appointment.staff,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        durationMinutes: Math.max(1, Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000)),
        price: appointment.service.price,
        taxRate: appointment.service.taxRate,
        priceTaxMode: appointment.service.priceTaxMode,
      }];
    const paid = appointment.invoice?.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
    return Response.json({
      data: {
        id: appointment.id,
        branch: { id: appointment.branch.id, name: appointment.branch.name, timezone: appointment.branch.timezone },
        customer: {
          id: appointment.customer.id,
          name: appointment.customer.name,
          phone: appointment.customer.phone,
          email: appointment.customer.email,
          notes: appointment.customer.notes,
          allergies: appointment.customer.allergies,
          tags: appointment.customer.tags,
          visitCount: appointment.customer.appointments.length,
          loyaltyBalance: appointment.customer.loyaltyLedger.reduce((sum, entry) => sum + entry.points, 0),
        },
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        status: appointment.status,
        source: appointment.source,
        resource: appointment.resource ? { id: appointment.resource.id, name: appointment.resource.name, type: appointment.resource.type } : null,
        notes: appointment.notes,
        cancellationReason: appointment.cancellationReason,
        bookingReference: appointment.id,
        createdAt: appointment.createdAt.toISOString(),
        serviceLines: serviceLines.map((line) => ({
          id: line.id,
          serviceId: line.serviceId,
          serviceName: line.service.name,
          staffId: line.staffId,
          staffName: line.staff?.user.name ?? "Unassigned",
          startsAt: (line.startsAt ?? appointment.startsAt).toISOString(),
          endsAt: (line.endsAt ?? appointment.endsAt).toISOString(),
          durationMinutes: line.durationMinutes,
          price: Number(line.price),
          taxRate: Number(line.taxRate),
          priceTaxMode: line.priceTaxMode,
          bufferBefore: line.service.bufferBefore,
          bufferAfter: line.service.bufferAfter,
        })),
        invoice: appointment.invoice ? {
          id: appointment.invoice.id,
          number: appointment.invoice.number,
          status: appointment.invoice.status,
          subtotal: Number(appointment.invoice.subtotal),
          discount: Number(appointment.invoice.discount),
          tax: Number(appointment.invoice.tax),
          tip: Number(appointment.invoice.tip),
          total: Number(appointment.invoice.total),
          paid,
          outstanding: Math.max(0, Number(appointment.invoice.total) - paid),
          payments: appointment.invoice.payments.map((payment) => ({
            id: payment.id,
            method: payment.method,
            amount: Number(payment.amount),
            reference: payment.reference,
            createdAt: payment.createdAt.toISOString(),
          })),
        } : null,
        review: appointment.review ? {
          id: appointment.review.id,
          rating: appointment.review.rating,
          comment: appointment.review.comment,
          salonReply: appointment.review.salonReply,
          status: appointment.review.status,
        } : null,
        history: appointment.statusHistory.map((entry) => ({
          id: entry.id,
          status: entry.status,
          note: entry.note,
          createdAt: entry.createdAt.toISOString(),
        })),
        permissions: {
          canWrite: context.permissions.has("appointment:write"),
          canSell: context.permissions.has("sale:write"),
        },
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid appointment update", 400, parsed.error.flatten());
    const { appointmentId } = await params;
    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      include: { invoice: true, serviceLines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!appointment) throw new OperationsError("NOT_FOUND", "Appointment not found", 404);
    const context = await requireOperationsContext("appointment:write", { branchId: appointment.branchId, requireBranch: true });
    if (parsed.data.status && parsed.data.status !== appointment.status && !transitions[appointment.status]?.includes(parsed.data.status)) {
      throw new OperationsError("CONFLICT", `Cannot move appointment from ${appointment.status} to ${parsed.data.status}`, 409);
    }

    if (appointment.invoice && parsed.data.serviceLines) {
      throw new OperationsError("CONFLICT", "Service lines cannot be changed after an invoice has been created", 409);
    }
    if (parsed.data.customerId) {
      const customer = await db.customer.findFirst({ where: { id: parsed.data.customerId, tenantId: context.tenant.id } });
      if (!customer) throw new OperationsError("NOT_FOUND", "Customer was not found", 404);
    }

    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : appointment.startsAt;
    const targetStatus = parsed.data.status ?? appointment.status;
    const targetResourceId = parsed.data.resourceId !== undefined ? parsed.data.resourceId : appointment.resourceId;
    const existingLines = appointment.serviceLines.length
      ? appointment.serviceLines
      : [{ id: "", serviceId: appointment.serviceId, staffId: appointment.staffId, durationMinutes: Math.max(1, Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000)), price: 0, taxRate: 18, priceTaxMode: "EXCLUSIVE" as const, sortOrder: 0 }];
    const requestedLines = parsed.data.serviceLines?.length
      ? parsed.data.serviceLines
      : existingLines.map((line, index) => ({
        serviceId: line.serviceId,
        staffId: index === 0 && parsed.data.staffId !== undefined ? parsed.data.staffId : line.staffId,
        durationMinutes: line.durationMinutes,
        price: Number(line.price),
        taxRate: Number(line.taxRate),
        priceTaxMode: line.priceTaxMode,
      }));
    const scheduledLines: Array<{
      serviceId: string;
      price: number;
      taxRate: number;
      priceTaxMode: "EXCLUSIVE" | "INCLUSIVE";
      staffId: string | null;
      durationMinutes: number;
      sortOrder: number;
      startsAt: Date;
      endsAt: Date;
    }> = [];
    let cursor = startsAt;
    for (let index = 0; index < requestedLines.length; index += 1) {
      const line = requestedLines[index];
      const service = await resolveBranchService(appointment.branchId, line.serviceId);
      if (!service) throw new OperationsError("NOT_FOUND", "A service is no longer available at this branch", 404);
      const durationMinutes = line.durationMinutes ?? service.durationMinutes;
      const price = line.price ?? Number(service.price);
      const taxRate = line.taxRate ?? Number(service.taxRate);
      const priceTaxMode = line.priceTaxMode ?? service.priceTaxMode;
      const lineStartsAt = cursor;
      const lineEndsAt = new Date(lineStartsAt.getTime() + durationMinutes * 60_000);
      const requestedStaffId = line.staffId ?? null;
      const requiresCapacity = ["CONFIRMED", "CHECKED_IN", "IN_SERVICE"].includes(targetStatus);
      let assignedStaffId = requestedStaffId;
      if (requiresCapacity) {
        const available = await findAvailableStaff(
          db,
          appointment.branchId,
          line.serviceId,
          new Date(lineStartsAt.getTime() - service.bufferBefore * 60_000),
          new Date(lineEndsAt.getTime() + service.bufferAfter * 60_000),
          requestedStaffId,
          appointment.id,
        );
        if (!available) throw new OperationsError("CONFLICT", `${service.name} is unavailable at that time`, 409);
        assignedStaffId = available;
      }
      scheduledLines.push({ serviceId: line.serviceId, staffId: assignedStaffId, durationMinutes, price, taxRate, priceTaxMode, sortOrder: index, startsAt: lineStartsAt, endsAt: lineEndsAt });
      cursor = lineEndsAt;
    }
    const endsAt = scheduledLines.at(-1)!.endsAt;
    const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(startsAt);
    const dayOfWeek = new Date(`${indiaDate}T12:00:00+05:30`).getUTCDay();
    const branchHours = await db.operatingHour.findUnique({ where: { branchId_dayOfWeek: { branchId: appointment.branchId, dayOfWeek } } });
    if (!branchHours || branchHours.isClosed) throw new OperationsError("POLICY", "The branch is closed on this day", 409);
    const opensAt = new Date(`${indiaDate}T${branchHours.opensAt}:00+05:30`);
    const closesAt = new Date(`${indiaDate}T${branchHours.closesAt}:00+05:30`);
    if (startsAt < opensAt || endsAt > closesAt) throw new OperationsError("POLICY", "Appointment falls outside branch operating hours", 409);
    if (["CONFIRMED", "CHECKED_IN", "IN_SERVICE"].includes(targetStatus) && targetResourceId && !await resourceIsAvailable(db, appointment.branchId, targetResourceId, startsAt, endsAt, appointment.id)) {
      throw new OperationsError("CONFLICT", "Selected resource is unavailable at this time", 409);
    }
    const staffId = scheduledLines[0].staffId;

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          customerId: parsed.data.customerId,
          serviceId: scheduledLines[0].serviceId,
          startsAt,
          endsAt,
          staffId,
          resourceId: targetResourceId || null,
          status: parsed.data.status,
          source: parsed.data.source,
          notes: parsed.data.notes,
          cancellationReason: parsed.data.cancellationReason,
        },
      });
      await tx.appointmentServiceLine.deleteMany({ where: { appointmentId: appointment.id } });
      await tx.appointmentServiceLine.createMany({
        data: scheduledLines.map((line) => ({
          appointmentId: appointment.id,
          serviceId: line.serviceId,
          staffId: line.staffId,
          startsAt: line.startsAt,
          endsAt: line.endsAt,
          durationMinutes: line.durationMinutes,
          price: line.price,
          taxRate: line.taxRate,
          priceTaxMode: line.priceTaxMode,
          sortOrder: line.sortOrder,
        })),
      });
      if (parsed.data.status && parsed.data.status !== appointment.status) {
        await tx.appointmentStatusHistory.create({
          data: {
            appointmentId: result.id,
            status: parsed.data.status,
            note: parsed.data.cancellationReason || parsed.data.notes,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: parsed.data.status ? "APPOINTMENT_STATUS_CHANGED" : "APPOINTMENT_RESCHEDULED",
          entity: "Appointment",
          entityId: result.id,
          metadata: { idempotencyKey: parsed.data.idempotencyKey },
        },
      });
      return result;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
