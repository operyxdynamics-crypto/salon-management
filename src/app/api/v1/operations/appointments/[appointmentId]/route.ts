import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { findAvailableStaff, resolveBranchService } from "@/lib/availability";
import { can } from "@/lib/rbac";

const schema = z.object({
  status: z.enum(["CONFIRMED", "CHECKED_IN", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  startsAt: z.iso.datetime().optional(),
  staffId: z.string().nullable().optional(),
  notes: z.string().max(500).optional(),
  cancellationReason: z.string().max(250).optional(),
  idempotencyKey: z.string().min(12).max(120),
});

const transitions: Record<string, string[]> = {
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
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
          canWrite: can(context.user.role, "appointment:write"),
          canSell: can(context.user.role, "sale:write"),
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
      include: { serviceLines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!appointment) throw new OperationsError("NOT_FOUND", "Appointment not found", 404);
    const context = await requireOperationsContext("appointment:write", { branchId: appointment.branchId, requireBranch: true });
    if (parsed.data.status && parsed.data.status !== appointment.status && !transitions[appointment.status]?.includes(parsed.data.status)) {
      throw new OperationsError("CONFLICT", `Cannot move appointment from ${appointment.status} to ${parsed.data.status}`, 409);
    }

    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : appointment.startsAt;
    const existingLines = appointment.serviceLines.length
      ? appointment.serviceLines
      : [{ id: "", serviceId: appointment.serviceId, staffId: appointment.staffId, durationMinutes: Math.max(1, Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000)), sortOrder: 0 }];
    const scheduledLines: Array<{
      id: string;
      serviceId: string;
      staffId: string | null;
      durationMinutes: number;
      sortOrder: number;
      startsAt: Date;
      endsAt: Date;
    }> = [];
    let cursor = startsAt;
    for (let index = 0; index < existingLines.length; index += 1) {
      const line = existingLines[index];
      const service = await resolveBranchService(appointment.branchId, line.serviceId);
      if (!service) throw new OperationsError("NOT_FOUND", "A service is no longer available at this branch", 404);
      const lineStartsAt = cursor;
      const lineEndsAt = new Date(lineStartsAt.getTime() + line.durationMinutes * 60_000);
      const requestedStaffId = index === 0 && parsed.data.staffId !== undefined ? parsed.data.staffId : line.staffId;
      if (requestedStaffId && (parsed.data.startsAt || parsed.data.staffId !== undefined)) {
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
      }
      scheduledLines.push({ ...line, staffId: requestedStaffId, startsAt: lineStartsAt, endsAt: lineEndsAt });
      cursor = lineEndsAt;
    }
    const endsAt = scheduledLines.at(-1)!.endsAt;
    const staffId = scheduledLines[0].staffId;

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          startsAt,
          endsAt,
          staffId,
          status: parsed.data.status,
          notes: parsed.data.notes,
          cancellationReason: parsed.data.cancellationReason,
        },
      });
      for (const line of scheduledLines) {
        if (line.id) {
          await tx.appointmentServiceLine.update({
            where: { id: line.id },
            data: { staffId: line.staffId, startsAt: line.startsAt, endsAt: line.endsAt },
          });
        }
      }
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
