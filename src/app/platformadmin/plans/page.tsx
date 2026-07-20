import { PageHeader } from "@/components/platform-admin/shell";
import { PlansEditor } from "@/components/platform-admin/plans-editor";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans · Operyx" };

/** What we sell, and what it costs. Editable without a deploy, because early pricing moves. */
export default async function PlansPage() {
  const plans = await db.subscriptionPlan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { tenantSubscriptions: true } } },
  });

  return <>
    <PageHeader title="Plans" blurb="What we sell. Changing a price here never re-prices an existing customer." />
    <PlansEditor plans={plans.map((plan) => ({
      id: plan.id, code: plan.code, name: plan.name, description: plan.description,
      // Rupees for the UI; paise is a storage concern and nothing on screen should have to divide.
      monthlyPrice: plan.monthlyPricePaise / 100,
      annualPrice: plan.annualPricePaise / 100,
      setupFee: plan.setupFeePaise / 100,
      trialDays: plan.trialDays,
      maxBranches: plan.maxBranches, maxStaff: plan.maxStaff, maxServices: plan.maxServices,
      maxMonthlyAppointments: plan.maxMonthlyAppointments, maxStorageMb: plan.maxStorageMb,
      features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
      isPublic: plan.isPublic, isActive: plan.isActive, sortOrder: plan.sortOrder,
      subscribers: plan._count.tenantSubscriptions,
    }))} />
  </>;
}
