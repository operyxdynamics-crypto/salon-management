import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("OPEN"), branchId: z.string().min(1), openingBalance: z.number().nonnegative(), idempotencyKey: z.string().min(12) }),
  z.object({ action: z.literal("CLOSE"), branchId: z.string().min(1), closingBalance: z.number().nonnegative(), idempotencyKey: z.string().min(12) }),
]);

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid register action", 400, parsed.error.flatten());
    const context = await requireOperationsContext("sale:write", { branchId: parsed.data.branchId, requireBranch: true });
    const open = await db.registerSession.findFirst({ where: { branchId: context.branch!.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    if (parsed.data.action === "OPEN") {
      if (open) throw new OperationsError("CONFLICT", "The cash register is already open", 409);
      const session = await db.registerSession.create({ data: { branchId: context.branch!.id, openedById: context.user.id, openingBalance: parsed.data.openingBalance } });
      await db.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "REGISTER_OPENED", entity: "RegisterSession", entityId: session.id, metadata: { openingBalance: parsed.data.openingBalance } } });
      return Response.json({ data: session }, { status: 201 });
    }
    if (!open) throw new OperationsError("CONFLICT", "There is no open cash register", 409);
    const cash = await db.paymentRecord.aggregate({
      where: { method: "CASH", invoice: { branchId: context.branch!.id, createdAt: { gte: open.openedAt }, status: { in: ["PAID", "PARTIALLY_PAID"] } } },
      _sum: { amount: true },
    });
    const expectedBalance = Number(open.openingBalance) + Number(cash._sum.amount ?? 0);
    const session = await db.registerSession.update({
      where: { id: open.id },
      data: { status: "CLOSED", closedById: context.user.id, closingBalance: parsed.data.closingBalance, expectedBalance, variance: parsed.data.closingBalance - expectedBalance, closedAt: new Date() },
    });
    await db.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "REGISTER_CLOSED", entity: "RegisterSession", entityId: session.id, metadata: { expectedBalance, closingBalance: parsed.data.closingBalance, variance: parsed.data.closingBalance - expectedBalance } } });
    return Response.json({ data: session });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId");
    const context = await requireOperationsContext("sale:write", { branchId: branchId ?? undefined, requireBranch: true });
    const open = await db.registerSession.findFirst({ where: { branchId: context.branch!.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    const since = open?.openedAt ?? new Date(new Date().setHours(0, 0, 0, 0));
    const [payments, refunds, expenses] = await Promise.all([
      db.paymentRecord.groupBy({
        by: ["method"],
        where: { invoice: { branchId: context.branch!.id, type: "SALE", status: { in: ["PAID", "PARTIALLY_PAID"] }, createdAt: { gte: since } } },
        _sum: { amount: true },
      }),
      db.paymentRecord.groupBy({
        by: ["method"],
        where: { invoice: { branchId: context.branch!.id, type: "REFUND", status: { in: ["PAID", "PARTIALLY_PAID"] }, createdAt: { gte: since } } },
        _sum: { amount: true },
      }),
      db.expense.aggregate({ where: { branchId: context.branch!.id, spentAt: { gte: since } }, _sum: { amount: true } }),
    ]);
    const byMethod = (method: string, rows: typeof payments) => Number(rows.find((row) => row.method === method)?._sum.amount ?? 0);
    const cashSales = byMethod("CASH", payments);
    const cashRefunds = byMethod("CASH", refunds);
    return Response.json({
      data: {
        open,
        since: since.toISOString(),
        sales: Object.fromEntries(payments.map((row) => [row.method, Number(row._sum.amount ?? 0)])),
        refunds: Object.fromEntries(refunds.map((row) => [row.method, Number(row._sum.amount ?? 0)])),
        expenses: Number(expenses._sum.amount ?? 0),
        expectedCash: Number(open?.openingBalance ?? 0) + cashSales - cashRefunds,
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
