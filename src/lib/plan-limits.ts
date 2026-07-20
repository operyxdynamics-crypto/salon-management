import { checkLimit, isUnlimited } from "./billing-plans";
import { db } from "./db";
import { PlatformError } from "./platform-auth";

/**
 * Plan capacity checks.
 *
 * These are what make a pricing tier mean something. Previously only services and appointments were
 * checked, so a salon on the entry plan could open twenty branches and hire fifty people - which
 * makes the tiers decorative and leaves nobody with a reason to upgrade.
 *
 * Every message names the plan and the way out. "Limit reached" tells an owner they are stuck;
 * "Salon includes 15 team members, and you're using 15. Upgrade to Group for more." tells them what
 * to do about it. Only the second version ever sells an upgrade, and only the second is fair to
 * someone mid-shift trying to add a new joiner.
 */

export async function requireTenantPlan(tenantId: string) {
  const subscription = await db.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } });
  if (!subscription || !subscription.plan.isActive) throw new PlatformError("LIMIT_EXCEEDED", "An active subscription plan must be assigned", 409);
  return subscription.plan;
}

/** The next plan up, so a limit message can name it rather than saying "a bigger plan". */
async function nextPlanUp(sortOrder: number) {
  const plan = await db.subscriptionPlan.findFirst({
    where: { isActive: true, isPublic: true, sortOrder: { gt: sortOrder } },
    orderBy: { sortOrder: "asc" },
    select: { name: true },
  });
  return plan?.name;
}

type TenantPlan = Awaited<ReturnType<typeof requireTenantPlan>>;

async function enforce(
  what: "branches" | "staff" | "services",
  tenantId: string,
  count: () => Promise<number>,
  limitOf: (plan: TenantPlan) => number,
) {
  const plan = await requireTenantPlan(tenantId);
  const limit = limitOf(plan);
  // Skip the count entirely when the plan is unlimited - no reason to ask the database a question
  // whose answer cannot change the outcome.
  if (isUnlimited(limit)) return;

  const used = await count();
  const result = checkLimit(what, used, limit, plan.name, await nextPlanUp(plan.sortOrder));
  if (!result.allowed) {
    throw new PlatformError("LIMIT_EXCEEDED", result.message!, 409, { used: result.used, limit: result.limit, plan: plan.name });
  }
}

/** Branches and staff are the two levers the tiers sell on, so these matter most. */
export async function assertBranchCapacity(tenantId: string) {
  return enforce("branches", tenantId,
    () => db.branch.count({ where: { tenantId, publicationStatus: { not: "ARCHIVED" } } }),
    (plan) => plan.maxBranches);
}

export async function assertStaffCapacity(tenantId: string) {
  // Active logins only. Someone who has left should not occupy a seat the salon is paying for -
  // deactivating them has to actually free capacity, or the number becomes a ratchet.
  return enforce("staff", tenantId,
    () => db.staff.count({ where: { user: { tenantId, isActive: true } } }),
    (plan) => plan.maxStaff);
}

export async function assertServiceCapacity(tenantId: string) {
  return enforce("services", tenantId,
    () => db.service.count({ where: { tenantId, isActive: true } }),
    (plan) => plan.maxServices);
}

export async function assertAppointmentCapacity(tenantId: string, date = new Date()) {
  const plan = await requireTenantPlan(tenantId);
  if (isUnlimited(plan.maxMonthlyAppointments)) return;

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const used = await db.appointment.count({ where: { branch: { tenantId }, createdAt: { gte: start, lt: end } } });
  if (used >= plan.maxMonthlyAppointments) {
    throw new PlatformError("LIMIT_EXCEEDED", `${plan.name} covers ${plan.maxMonthlyAppointments} bookings a month, and you've used ${used}. Upgrade to keep booking.`, 409, { used, limit: plan.maxMonthlyAppointments });
  }
}

/**
 * Whether a plan includes a feature - attendance, franchise tooling, multi-branch reporting.
 *
 * Read from the plan's `features` list rather than inferred from its name, so a grandfathered or
 * custom plan never needs a code change to work.
 */
export async function planHasFeature(tenantId: string, feature: string) {
  const plan = await requireTenantPlan(tenantId);
  const features = Array.isArray(plan.features) ? plan.features : [];
  return features.includes(feature);
}

export async function assertPlanFeature(tenantId: string, feature: string, label: string) {
  const plan = await requireTenantPlan(tenantId);
  const features = Array.isArray(plan.features) ? plan.features : [];
  if (features.includes(feature)) return;
  throw new PlatformError("LIMIT_EXCEEDED", `${label} isn't part of ${plan.name}. Upgrade to turn it on.`, 409, { feature, plan: plan.name });
}
