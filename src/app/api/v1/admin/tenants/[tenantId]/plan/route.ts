import { z } from "zod";
import { isUnlimited } from "@/lib/billing-plans";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

const schema = z.object({ planId: z.string().min(1), note: z.string().trim().max(500).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid plan assignment", 400, parsed.error.flatten());
    const { tenantId } = await params;
    const [tenant, plan] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, include: { _count: { select: { branches: true, services: true } }, users: { where: { role: { not: "CUSTOMER" } } } } }),
      db.subscriptionPlan.findFirst({ where: { id: parsed.data.planId, isActive: true } }),
    ]);
    if (!tenant || !plan) throw new PlatformError("NOT_FOUND", "Tenant or plan not found", 404);
    const usage = { branches: tenant._count.branches, services: tenant._count.services, staff: tenant.users.length };

    /**
     * Stop a *downgrade* that would strand a salon over its new limits - but never mistake
     * "unlimited" for "zero".
     *
     * A limit of 0 means no ceiling, so the old `usage.branches > plan.maxBranches` check failed
     * for every salon being moved onto an unlimited plan: three branches is more than zero, so
     * upgrading to Franchise was impossible. Exactly the wrong way round.
     */
    const over = ([used, limit]: [number, number]) => !isUnlimited(limit) && used > limit;
    const breaches = ([
      ["branches", usage.branches, plan.maxBranches],
      ["services", usage.services, plan.maxServices],
      ["team members", usage.staff, plan.maxStaff],
    ] as const).filter(([, used, limit]) => over([used, limit]));

    if (breaches.length) {
      const detail = breaches.map(([what, used, limit]) => `${used} ${what} against a limit of ${limit}`).join(", ");
      throw new PlatformError("LIMIT_EXCEEDED", `This salon is already using ${detail}. Reduce usage or pick a larger plan.`, 409, { usage, limits: { branches: plan.maxBranches, services: plan.maxServices, staff: plan.maxStaff } });
    }
    await db.$transaction(async (tx) => {
      await tx.tenantSubscription.upsert({
        where: { tenantId },
        update: { planId: plan.id, assignedBy: admin.user.id, notes: parsed.data.note, startsAt: new Date(), endsAt: null },
        create: { tenantId, planId: plan.id, assignedBy: admin.user.id, notes: parsed.data.note },
      });
      await tx.tenant.update({ where: { id: tenantId }, data: { subscription: plan.code } });
      await tx.auditLog.create({ data: { userId: admin.user.id, tenantId, action: "SUBSCRIPTION_PLAN_ASSIGNED", entity: "Tenant", entityId: tenantId, metadata: { planId: plan.id, planCode: plan.code, note: parsed.data.note ?? null } } });
    });
    return Response.json({ data: { tenantId, plan } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
