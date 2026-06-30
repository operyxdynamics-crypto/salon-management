import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { can } from "@/lib/rbac";

const updateSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  email: z.email().nullable().optional(),
  birthday: z.iso.datetime().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  allergies: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  whatsappConsent: z.boolean().optional(),
  smsConsent: z.boolean().optional(),
  emailConsent: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  loyaltyAdjustment: z.number().int().min(-100000).max(100000).optional(),
  loyaltyReason: z.string().trim().min(3).max(200).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const branchId = searchParams.get("branchId") ?? "all";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? 20)));
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const context = await requireOperationsContext("customer:read", { branchId, allowAll: true });
    const { customerId } = await params;
    const authorizedBranchIds = context.branch ? [context.branch.id] : context.branches.map((branch) => branch.id);
    const customerExists = await db.customer.findFirst({ where: { id: customerId, tenantId: context.tenant.id }, select: { id: true } });
    if (!customerExists) throw new OperationsError("NOT_FOUND", "Customer not found", 404);
    if (context.user.role === "STYLIST") {
      const relationship = await db.appointment.findFirst({
        where: {
          customerId,
          branchId: { in: authorizedBranchIds },
          OR: [
            { staffId: context.user.staff?.id },
            { serviceLines: { some: { staffId: context.user.staff?.id } } },
          ],
        },
        select: { id: true },
      });
      if (!relationship) throw new OperationsError("FORBIDDEN", "You can only view customers assigned to you", 403);
    }
    const appointmentWhere = {
      customerId,
      branchId: { in: authorizedBranchIds },
      status: status ? status as never : undefined,
      startsAt: dateFrom || dateTo ? {
        gte: dateFrom ? new Date(`${dateFrom}T00:00:00+05:30`) : undefined,
        lt: dateTo ? new Date(new Date(`${dateTo}T00:00:00+05:30`).getTime() + 86_400_000) : undefined,
      } : undefined,
    };
    const invoiceWhere = {
      customerId,
      branchId: { in: authorizedBranchIds },
      createdAt: dateFrom || dateTo ? {
        gte: dateFrom ? new Date(`${dateFrom}T00:00:00+05:30`) : undefined,
        lt: dateTo ? new Date(new Date(`${dateTo}T00:00:00+05:30`).getTime() + 86_400_000) : undefined,
      } : undefined,
    };
    const rewardRule = await db.rewardRule.findFirst({ where: { tenantId: context.tenant.id, isActive: true }, orderBy: { createdAt: "desc" } });
    const customer = await db.customer.findFirst({
      where: { id: customerId, tenantId: context.tenant.id },
      include: {
        appointments: {
          where: appointmentWhere,
          include: {
            branch: true,
            service: true,
            staff: { include: { user: true } },
            serviceLines: { include: { service: true, staff: { include: { user: true } } }, orderBy: { sortOrder: "asc" } },
            invoice: { select: { id: true } },
          },
          orderBy: { startsAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        },
        invoices: {
          where: invoiceWhere,
          include: { branch: true, payments: true, lines: true },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        },
        loyaltyLedger: { orderBy: { createdAt: "desc" }, take: 100 },
        benefitTransactions: { orderBy: { createdAt: "desc" }, take: 150 },
        customerMemberships: { include: { membership: true }, orderBy: { startsAt: "desc" } },
        packagePurchases: { include: { package: true }, orderBy: { expiresAt: "desc" } },
        giftCards: { include: { branch: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!customer) throw new OperationsError("NOT_FOUND", "Customer not found", 404);
    const [appointmentsTotal, invoicesTotal, summaryAppointments, summaryInvoices] = await Promise.all([
      db.appointment.count({ where: appointmentWhere }),
      db.invoice.count({ where: invoiceWhere }),
      db.appointment.findMany({ where: { customerId, branchId: { in: authorizedBranchIds } }, select: { status: true } }),
      db.invoice.findMany({
        where: { customerId, branchId: { in: authorizedBranchIds } },
        include: { payments: { select: { amount: true } } },
      }),
    ]);
    const lifetimeSpend = summaryInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const outstanding = summaryInvoices.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0);
      return sum + Math.max(0, Number(invoice.total) - paid);
    }, 0);
    return Response.json({
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          birthday: customer.birthday?.toISOString() ?? null,
          notes: customer.notes,
          preferences: customer.preferences,
          allergies: customer.allergies,
          tags: customer.tags,
          isArchived: customer.isArchived,
          whatsappConsent: customer.whatsappConsent,
          smsConsent: customer.smsConsent,
          emailConsent: customer.emailConsent,
          walletBalance: Number(customer.walletBalance),
          createdAt: customer.createdAt.toISOString(),
        },
        summary: {
          appointments: summaryAppointments.length,
          completedVisits: summaryAppointments.filter((appointment) => appointment.status === "COMPLETED").length,
          lifetimeSpend,
          outstanding,
          loyaltyBalance: customer.loyaltyLedger.reduce((sum, entry) => sum + entry.points, 0),
          walletBalance: Number(customer.walletBalance),
          rewardValue: customer.loyaltyLedger.reduce((sum, entry) => sum + entry.points, 0) * Number(rewardRule?.amountPerPoint ?? 1),
        },
        appointments: customer.appointments.map((appointment) => ({
          id: appointment.id,
          branchId: appointment.branchId,
          branchName: appointment.branch.name,
          startsAt: appointment.startsAt.toISOString(),
          endsAt: appointment.endsAt.toISOString(),
          status: appointment.status,
          source: appointment.source,
          services: appointment.serviceLines.length ? appointment.serviceLines.map((line) => line.service.name) : [appointment.service.name],
          staff: appointment.serviceLines.length
            ? appointment.serviceLines.map((line) => line.staff?.user.name ?? "Unassigned")
            : [appointment.staff?.user.name ?? "Unassigned"],
          invoiceId: appointment.invoice?.id ?? null,
        })),
        invoices: customer.invoices.map((invoice) => {
          const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
          return {
            id: invoice.id,
            number: invoice.number,
            branchId: invoice.branchId,
            branchName: invoice.branch.name,
            status: invoice.status,
            type: invoice.type,
            taxMode: invoice.taxMode,
            total: Number(invoice.total),
            paid,
            outstanding: Math.max(0, Number(invoice.total) - paid),
            createdAt: invoice.createdAt.toISOString(),
            lines: invoice.lines.map((line) => ({
              id: line.id,
              description: line.description,
              type: line.type,
              quantity: Number(line.quantity),
              total: Number(line.total),
            })),
            payments: invoice.payments.map((payment) => ({
              id: payment.id,
              method: payment.method,
              amount: Number(payment.amount),
              reference: payment.reference,
            })),
          };
        }),
        loyalty: customer.loyaltyLedger.map((entry) => ({
          id: entry.id,
          points: entry.points,
          reason: entry.reason,
          expiresAt: entry.expiresAt?.toISOString() ?? null,
          createdAt: entry.createdAt.toISOString(),
        })),
        benefitTransactions: customer.benefitTransactions.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          amount: entry.amount === null ? null : Number(entry.amount),
          points: entry.points,
          note: entry.note,
          createdAt: entry.createdAt.toISOString(),
        })),
        memberships: customer.customerMemberships.map((membership) => ({
          id: membership.id,
          name: membership.membership.name,
          startsAt: membership.startsAt.toISOString(),
          endsAt: membership.endsAt.toISOString(),
          status: membership.status,
        })),
        packages: customer.packagePurchases.map((purchase) => ({
          id: purchase.id,
          name: purchase.package.name,
          balance: purchase.balance,
          expiresAt: purchase.expiresAt.toISOString(),
        })),
        giftCards: customer.giftCards.map((card) => ({
          id: card.id,
          code: card.code,
          branchName: card.branch?.name ?? null,
          balance: Number(card.balance),
          status: card.status,
          expiresAt: card.expiresAt?.toISOString() ?? null,
        })),
        pagination: { page, pageSize, appointmentsTotal, invoicesTotal },
        permissions: { canWrite: can(context.user.role, "customer:write") },
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid customer update", 400, parsed.error.flatten());
    const context = await requireOperationsContext("customer:write", { branchId: parsed.data.branchId, requireBranch: true });
    const { customerId } = await params;
    const existing = await db.customer.findFirst({ where: { id: customerId, tenantId: context.tenant.id } });
    if (!existing) throw new OperationsError("NOT_FOUND", "Customer not found", 404);
    if (parsed.data.loyaltyAdjustment && !parsed.data.loyaltyReason) {
      throw new OperationsError("VALIDATION", "A reason is required for a loyalty adjustment", 400);
    }
    const customer = await db.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id: customerId },
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          birthday: parsed.data.birthday === undefined ? undefined : parsed.data.birthday ? new Date(parsed.data.birthday) : null,
          notes: parsed.data.notes,
          allergies: parsed.data.allergies,
          tags: parsed.data.tags,
          whatsappConsent: parsed.data.whatsappConsent,
          smsConsent: parsed.data.smsConsent,
          emailConsent: parsed.data.emailConsent,
          isArchived: parsed.data.isArchived,
        },
      });
      if (parsed.data.loyaltyAdjustment) {
        await tx.loyaltyLedger.create({
          data: { customerId, points: parsed.data.loyaltyAdjustment, reason: parsed.data.loyaltyReason! },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: parsed.data.loyaltyAdjustment ? "CUSTOMER_LOYALTY_ADJUSTED" : "CUSTOMER_UPDATED",
          entity: "Customer",
          entityId: customerId,
          metadata: { branchId: context.branch!.id, loyaltyAdjustment: parsed.data.loyaltyAdjustment },
        },
      });
      return updated;
    });
    return Response.json({ data: customer });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
