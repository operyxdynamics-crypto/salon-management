import { db } from "./db";
import { PlatformError } from "./platform-auth";

export async function requireTenantPlan(tenantId: string) {
  const subscription = await db.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } });
  if (!subscription || !subscription.plan.isActive) throw new PlatformError("LIMIT_EXCEEDED", "An active subscription plan must be assigned", 409);
  return subscription.plan;
}

export async function assertServiceCapacity(tenantId: string) {
  const plan = await requireTenantPlan(tenantId);
  const used = await db.service.count({ where: { tenantId, isActive: true } });
  if (used >= plan.maxServices) throw new PlatformError("LIMIT_EXCEEDED", "Service limit reached for the assigned plan", 409, { used, limit: plan.maxServices });
}

export async function assertAppointmentCapacity(tenantId: string, date = new Date()) {
  const plan = await requireTenantPlan(tenantId);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const used = await db.appointment.count({ where: { branch: { tenantId }, createdAt: { gte: start, lt: end } } });
  if (used >= plan.maxMonthlyAppointments) throw new PlatformError("LIMIT_EXCEEDED", "Monthly appointment limit reached for the assigned plan", 409, { used, limit: plan.maxMonthlyAppointments });
}
