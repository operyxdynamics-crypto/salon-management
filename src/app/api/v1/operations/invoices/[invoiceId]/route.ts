import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId") ?? "all";
    const context = await requireOperationsContext("report:read", { branchId, allowAll: true });
    const branchIds = context.branch ? [context.branch.id] : context.branches.map((branch) => branch.id);
    const { invoiceId } = await params;
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, branchId: { in: branchIds } },
      include: {
        branch: true,
        customer: true,
        appointment: { select: { id: true, startsAt: true, status: true } },
        lines: { include: { staff: { include: { user: true } } } },
        payments: true,
        parentInvoice: { select: { id: true, number: true } },
        refundInvoices: { select: { id: true, number: true, total: true, createdAt: true } },
      },
    });
    if (!invoice) throw new OperationsError("NOT_FOUND", "Invoice not found", 404);
    const benefitTransactions = await db.benefitTransaction.findMany({
      where: {
        tenantId: context.tenant.id,
        customerId: invoice.customerId,
        OR: [{ sourceId: invoice.id }, { note: invoice.number }],
      },
      orderBy: { createdAt: "asc" },
    });
    const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    return Response.json({
      data: {
        id: invoice.id,
        number: invoice.number,
        branch: { id: invoice.branchId, name: invoice.branch.name, city: invoice.branch.city },
        customer: { id: invoice.customerId, name: invoice.customer.name, phone: invoice.customer.phone, email: invoice.customer.email },
        appointment: invoice.appointment ? { id: invoice.appointment.id, startsAt: invoice.appointment.startsAt.toISOString(), status: invoice.appointment.status } : null,
        subtotal: Number(invoice.subtotal),
        discount: Number(invoice.discount),
        tax: Number(invoice.tax),
        taxMode: invoice.taxMode,
        tip: Number(invoice.tip),
        total: Number(invoice.total),
        paid,
        outstanding: Math.max(0, Number(invoice.total) - paid),
        status: invoice.status,
        type: invoice.type,
        voidReason: invoice.voidReason,
        createdAt: invoice.createdAt.toISOString(),
        parentInvoice: invoice.parentInvoice,
        refunds: invoice.refundInvoices.map((refund) => ({ id: refund.id, number: refund.number, total: Number(refund.total), createdAt: refund.createdAt.toISOString() })),
        lines: invoice.lines.map((line) => ({
          id: line.id,
          type: line.type,
          description: line.description,
          serviceId: line.serviceId,
          inventoryItemId: line.inventoryItemId,
          staff: line.staff?.user.name ?? null,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discount: Number(line.discount),
          taxRate: Number(line.taxRate),
          tax: Number(line.tax),
          total: Number(line.total),
        })),
        payments: invoice.payments.map((payment) => ({ id: payment.id, method: payment.method, amount: Number(payment.amount), reference: payment.reference, createdAt: payment.createdAt.toISOString() })),
        benefits: benefitTransactions.map((item) => ({
          id: item.id,
          kind: item.kind,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          amount: item.amount === null ? null : Number(item.amount),
          points: item.points,
          note: item.note,
          createdAt: item.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
