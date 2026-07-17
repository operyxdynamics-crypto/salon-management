import type { RegisterSession } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("OPEN"),
    branchId: z.string().min(1),
    openingBalance: z.number().nonnegative(),
    openingNote: z.string().max(500).optional(),
    idempotencyKey: z.string().min(12).max(120),
  }),
  z.object({
    action: z.literal("CLOSE"),
    branchId: z.string().min(1),
    closingBalance: z.number().nonnegative(),
    closingNote: z.string().max(500).optional(),
    idempotencyKey: z.string().min(12).max(120),
  }),
]);

const paymentMethods = ["CASH", "CARD", "UPI", "GIFT_CARD", "LOYALTY", "WALLET", "PACKAGE"];

type MethodTotalRow = { method: string; _sum: { amount: unknown } };

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function indiaDayStart(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${record.year}-${record.month}-${record.day}T00:00:00+05:30`);
}

function sessionDto(session: RegisterSession | null) {
  return session ? {
    id: session.id,
    branchId: session.branchId,
    status: session.status,
    openingBalance: Number(session.openingBalance),
    openingNote: session.openingNote,
    closingBalance: session.closingBalance === null ? null : Number(session.closingBalance),
    closingNote: session.closingNote,
    expectedBalance: session.expectedBalance === null ? null : Number(session.expectedBalance),
    variance: session.variance === null ? null : Number(session.variance),
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
  } : null;
}

function methodMap(rows: MethodTotalRow[]) {
  const values = Object.fromEntries(paymentMethods.map((method) => [method, 0]));
  for (const row of rows) values[row.method] = numberValue(row._sum.amount);
  return values;
}

async function expectedCashFor(branchId: string, since: Date, until: Date, openingBalance: number) {
  const [cashSales, cashRefunds, expenses] = await Promise.all([
    db.paymentRecord.aggregate({
      where: { method: "CASH", createdAt: { gte: since, lte: until }, invoice: { branchId, type: "SALE", status: { not: "VOID" } } },
      _sum: { amount: true },
    }),
    db.paymentRecord.aggregate({
      where: { method: "CASH", createdAt: { gte: since, lte: until }, invoice: { branchId, type: "REFUND", status: { not: "VOID" } } },
      _sum: { amount: true },
    }),
    db.expense.aggregate({ where: { branchId, spentAt: { gte: since, lte: until } }, _sum: { amount: true } }),
  ]);
  return Number((openingBalance + numberValue(cashSales._sum.amount) - numberValue(cashRefunds._sum.amount) - numberValue(expenses._sum.amount)).toFixed(2));
}

async function buildRegisterSummary(branchId: string) {
  const todayStart = indiaDayStart();
  const [open, lastClosed] = await Promise.all([
    db.registerSession.findFirst({ where: { branchId, status: "OPEN" }, orderBy: { openedAt: "desc" } }),
    db.registerSession.findFirst({
      where: {
        branchId,
        status: "CLOSED",
        OR: [{ openedAt: { gte: todayStart } }, { closedAt: { gte: todayStart } }],
      },
      orderBy: { closedAt: "desc" },
    }),
  ]);
  const session = open ?? lastClosed;
  const since = session?.openedAt ?? todayStart;
  const until = session?.closedAt ?? new Date();
  const dateFilter = { gte: since, lte: until };
  const saleInvoiceWhere = { branchId, type: "SALE" as const, status: { not: "VOID" as const }, createdAt: dateFilter };
  const refundInvoiceWhere = { branchId, type: "REFUND" as const, status: { not: "VOID" as const }, createdAt: dateFilter };

  const [salePayments, refundPayments, saleAgg, refundAgg, saleCount, refundCount, expensesAgg, expenses, invoices, stockMovements, benefitTransactions] = await Promise.all([
    db.paymentRecord.groupBy({
      by: ["method"],
      where: { createdAt: dateFilter, invoice: { branchId, type: "SALE", status: { not: "VOID" } } },
      _sum: { amount: true },
    }),
    db.paymentRecord.groupBy({
      by: ["method"],
      where: { createdAt: dateFilter, invoice: { branchId, type: "REFUND", status: { not: "VOID" } } },
      _sum: { amount: true },
    }),
    db.invoice.aggregate({ where: saleInvoiceWhere, _sum: { subtotal: true, discount: true, tax: true, tip: true, total: true } }),
    db.invoice.aggregate({ where: refundInvoiceWhere, _sum: { subtotal: true, discount: true, tax: true, tip: true, total: true } }),
    db.invoice.count({ where: saleInvoiceWhere }),
    db.invoice.count({ where: refundInvoiceWhere }),
    db.expense.aggregate({ where: { branchId, spentAt: dateFilter }, _sum: { amount: true } }),
    db.expense.findMany({ where: { branchId, spentAt: dateFilter }, orderBy: { spentAt: "desc" }, take: 20 }),
    db.invoice.findMany({
      where: { branchId, createdAt: dateFilter, status: { not: "VOID" } },
      include: { customer: true, payments: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.stockMovement.findMany({
      where: { branchId, createdAt: dateFilter },
      include: { inventoryItem: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.benefitTransaction.findMany({
      where: { branchId, createdAt: dateFilter },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const salePaymentMap = methodMap(salePayments);
  const refundPaymentMap = methodMap(refundPayments);
  const netPaymentMap = Object.fromEntries(paymentMethods.map((method) => [method, Number((salePaymentMap[method] - refundPaymentMap[method]).toFixed(2))]));
  const expenseTotal = numberValue(expensesAgg._sum.amount);
  const openingBalance = Number(session?.openingBalance ?? 0);
  const expectedCash = Number((openingBalance + salePaymentMap.CASH - refundPaymentMap.CASH - expenseTotal).toFixed(2));
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const commissionAgg = invoiceIds.length
    ? await db.commission.aggregate({ where: { sourceId: { in: invoiceIds } }, _sum: { amount: true } })
    : { _sum: { amount: 0 } };
  const benefits = benefitTransactions.reduce<Record<string, { count: number; amount: number; points: number }>>((summary, benefit) => {
    const current = summary[benefit.kind] ?? { count: 0, amount: 0, points: 0 };
    summary[benefit.kind] = {
      count: current.count + 1,
      amount: current.amount + numberValue(benefit.amount),
      points: current.points + numberValue(benefit.points),
    };
    return summary;
  }, {});

  return {
    state: open ? "OPEN" : lastClosed ? "CLOSED" : "NOT_OPENED",
    open: sessionDto(open),
    lastClosed: sessionDto(lastClosed),
    activeSession: sessionDto(session),
    since: since.toISOString(),
    until: until.toISOString(),
    sales: salePaymentMap,
    refunds: refundPaymentMap,
    netPayments: netPaymentMap,
    expectedCash,
    summary: {
      invoiceCount: saleCount,
      refundCount,
      grossSales: numberValue(saleAgg._sum.total),
      refundsTotal: numberValue(refundAgg._sum.total),
      netSales: numberValue(saleAgg._sum.total) - numberValue(refundAgg._sum.total),
      subtotal: numberValue(saleAgg._sum.subtotal) - numberValue(refundAgg._sum.subtotal),
      discount: numberValue(saleAgg._sum.discount) - numberValue(refundAgg._sum.discount),
      tax: numberValue(saleAgg._sum.tax) - numberValue(refundAgg._sum.tax),
      tips: numberValue(saleAgg._sum.tip) - numberValue(refundAgg._sum.tip),
      expenses: expenseTotal,
      commissions: numberValue(commissionAgg._sum.amount),
      stockMovementCount: stockMovements.length,
      stockQuantityMoved: stockMovements.reduce((sum, movement) => sum + Math.abs(Number(movement.quantity)), 0),
    },
    invoices: invoices.map((invoice) => {
      const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return {
        id: invoice.id,
        number: invoice.number,
        customer: invoice.customer.name,
        type: invoice.type,
        status: invoice.status,
        taxMode: invoice.taxMode,
        total: Number(invoice.total),
        tax: Number(invoice.tax),
        tip: Number(invoice.tip),
        paid,
        createdAt: invoice.createdAt.toISOString(),
        payments: invoice.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount), reference: payment.reference })),
      };
    }),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      category: expense.category,
      amount: Number(expense.amount),
      note: expense.note,
      spentAt: expense.spentAt.toISOString(),
    })),
    stockMovements: stockMovements.map((movement) => ({
      id: movement.id,
      product: movement.inventoryItem.name,
      type: movement.type,
      quantity: Number(movement.quantity),
      reference: movement.reference,
      createdAt: movement.createdAt.toISOString(),
    })),
    benefits,
  };
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid register action", 400, parsed.error.flatten());
    const context = await requireOperationsContext("sale:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branchId = context.branch!.id;

    if (parsed.data.action === "OPEN") {
      const existing = await db.registerSession.findUnique({ where: { openIdempotencyKey: parsed.data.idempotencyKey } });
      if (existing) return Response.json({ data: sessionDto(existing) });
      const open = await db.registerSession.findFirst({ where: { branchId, status: "OPEN" }, orderBy: { openedAt: "desc" } });
      if (open) throw new OperationsError("CONFLICT", "The cash register is already open", 409);
      const session = await db.registerSession.create({
        data: {
          branchId,
          openedById: context.user.id,
          openingBalance: parsed.data.openingBalance,
          openingNote: parsed.data.openingNote?.trim() || null,
          openIdempotencyKey: parsed.data.idempotencyKey,
        },
      });
      await db.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "REGISTER_OPENED",
          entity: "RegisterSession",
          entityId: session.id,
          metadata: { openingBalance: parsed.data.openingBalance, openingNote: parsed.data.openingNote ?? null, idempotencyKey: parsed.data.idempotencyKey },
        },
      });
      return Response.json({ data: sessionDto(session) }, { status: 201 });
    }

    const existingClose = await db.registerSession.findUnique({ where: { closeIdempotencyKey: parsed.data.idempotencyKey } });
    if (existingClose) return Response.json({ data: sessionDto(existingClose) });
    const open = await db.registerSession.findFirst({ where: { branchId, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    if (!open) throw new OperationsError("CONFLICT", "There is no open cash register", 409);
    const closedAt = new Date();
    const expectedBalance = await expectedCashFor(branchId, open.openedAt, closedAt, Number(open.openingBalance));
    const variance = Number((parsed.data.closingBalance - expectedBalance).toFixed(2));
    const session = await db.registerSession.update({
      where: { id: open.id },
      data: {
        status: "CLOSED",
        closedById: context.user.id,
        closingBalance: parsed.data.closingBalance,
        closingNote: parsed.data.closingNote?.trim() || null,
        expectedBalance,
        variance,
        closeIdempotencyKey: parsed.data.idempotencyKey,
        closedAt,
      },
    });
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "REGISTER_CLOSED",
        entity: "RegisterSession",
        entityId: session.id,
        metadata: { expectedBalance, closingBalance: parsed.data.closingBalance, variance, closingNote: parsed.data.closingNote ?? null, idempotencyKey: parsed.data.idempotencyKey },
      },
    });
    return Response.json({ data: sessionDto(session) });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId");
    const context = await requireOperationsContext("sale:write", { branchId: branchId ?? undefined, requireBranch: true });
    return Response.json({ data: await buildRegisterSummary(context.branch!.id) });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
