import { db } from "@/lib/db";
import { platformErrorResponse, requirePlatformAdmin } from "@/lib/platform-auth";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const [tenants, branches, appointments, invoices, plans] = await Promise.all([
      db.tenant.groupBy({ by: ["status"], _count: true }),
      db.branch.groupBy({ by: ["publicationStatus"], _count: true }),
      db.appointment.count(),
      db.invoice.aggregate({ where: { status: "PAID" }, _count: true, _sum: { total: true, tax: true } }),
      db.tenantSubscription.groupBy({ by: ["planId"], _count: true }),
    ]);
    const planNames = await db.subscriptionPlan.findMany({ select: { id: true, name: true, code: true } });
    return Response.json({
      data: {
        tenants,
        branches,
        appointments,
        invoices: { count: invoices._count, revenue: Number(invoices._sum.total ?? 0), tax: Number(invoices._sum.tax ?? 0) },
        plans: plans.map((item) => ({ ...item, plan: planNames.find((plan) => plan.id === item.planId) })),
      },
    });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
