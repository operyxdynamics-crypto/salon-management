import { db } from "@/lib/db";
import { operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const branchId = params.get("branchId") ?? "all";
    const page = Math.max(1, Number(params.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize") ?? 25)));
    const context = await requireOperationsContext("report:read", { branchId, allowAll: true });
    const branchIds = context.branch ? [context.branch.id] : context.branches.map((branch) => branch.id);
    const query = params.get("query")?.trim();
    const taxMode = params.get("taxMode");
    const status = params.get("status");
    const type = params.get("type");
    const customerId = params.get("customerId");
    const dateFrom = params.get("dateFrom");
    const dateTo = params.get("dateTo");
    const where = {
      branchId: { in: branchIds },
      customerId: customerId || undefined,
      taxMode: taxMode && taxMode !== "ALL" ? taxMode as never : undefined,
      status: status && status !== "ALL" ? status as never : undefined,
      type: type && type !== "ALL" ? type as never : undefined,
      createdAt: dateFrom || dateTo ? {
        gte: dateFrom ? new Date(`${dateFrom}T00:00:00+05:30`) : undefined,
        lt: dateTo ? new Date(new Date(`${dateTo}T00:00:00+05:30`).getTime() + 86_400_000) : undefined,
      } : undefined,
      OR: query ? [
        { number: { contains: query, mode: "insensitive" as const } },
        { customer: { name: { contains: query, mode: "insensitive" as const } } },
        { customer: { phone: { contains: query } } },
      ] : undefined,
    };
    const [total, invoices, aggregate, paidAggregate] = await Promise.all([
      db.invoice.count({ where }),
      db.invoice.findMany({
        where,
        include: { branch: true, customer: true, payments: true, lines: true, refundInvoices: { select: { id: true, number: true, total: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.invoice.aggregate({ where, _sum: { subtotal: true, discount: true, tax: true, total: true } }),
      db.paymentRecord.aggregate({ where: { invoice: where }, _sum: { amount: true } }),
    ]);
    const paidTotal = numberValue(paidAggregate._sum.amount);
    const invoiceTotal = numberValue(aggregate._sum.total);
    return Response.json({
      data: {
        invoices: invoices.map((invoice) => {
          const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
          return {
            id: invoice.id,
            number: invoice.number,
            branch: { id: invoice.branchId, name: invoice.branch.name },
            customer: { id: invoice.customerId, name: invoice.customer.name, phone: invoice.customer.phone },
            type: invoice.type,
            status: invoice.status,
            taxMode: invoice.taxMode,
            subtotal: Number(invoice.subtotal),
            discount: Number(invoice.discount),
            tax: Number(invoice.tax),
            tip: Number(invoice.tip),
            total: Number(invoice.total),
            paid,
            outstanding: Math.max(0, Number(invoice.total) - paid),
            createdAt: invoice.createdAt.toISOString(),
            payments: invoice.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount), reference: payment.reference })),
            lineCount: invoice.lines.length,
            refunds: invoice.refundInvoices.map((refund) => ({ id: refund.id, number: refund.number, total: Number(refund.total) })),
          };
        }),
        summary: {
          subtotal: numberValue(aggregate._sum.subtotal),
          discount: numberValue(aggregate._sum.discount),
          tax: numberValue(aggregate._sum.tax),
          total: invoiceTotal,
          paid: paidTotal,
          outstanding: Math.max(0, invoiceTotal - paidTotal),
          count: total,
        },
        pagination: { page, pageSize, total },
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
