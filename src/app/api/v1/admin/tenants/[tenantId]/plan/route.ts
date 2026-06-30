import { z } from "zod";
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
    const exceeded = usage.branches > plan.maxBranches || usage.services > plan.maxServices || usage.staff > plan.maxStaff;
    if (exceeded) throw new PlatformError("LIMIT_EXCEEDED", "Current salon usage exceeds this plan", 409, { usage, limits: { branches: plan.maxBranches, services: plan.maxServices, staff: plan.maxStaff } });
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
