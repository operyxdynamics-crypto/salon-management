import { PageHeader } from "@/components/platform-admin/shell";
import { AddOnsEditor } from "@/components/platform-admin/add-ons-editor";
import { PlansEditor } from "@/components/platform-admin/plans-editor";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Packages · Operyx" };

/**
 * What we sell.
 *
 * Plans and add-ons on one page because they are one catalogue: a plan is only half a package, and
 * pricing decisions that were made on separate screens tend to stop making sense together.
 *
 * Editable without a deploy, because early pricing moves. A company that has to ship code to try
 * ₹600 instead of ₹500 will simply never try it.
 */
export default async function PackagesPage() {
  const [plans, addOns] = await Promise.all([
    db.subscriptionPlan.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { tenantSubscriptions: true } } },
    }),
    db.addOn.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { subscriptions: true } } },
    }),
  ]);

  return <>
    <PageHeader title="Packages" blurb="Base plans and the add-ons that extend them. Changing a price here never re-prices an existing customer." />

    <p className="mt-6 rounded-2xl bg-[#FFF7DF] p-4 text-sm font-semibold text-[#865C12]">
      A price change applies to new sales only. Existing customers keep what they agreed until their
      subscription is changed — silently re-pricing live salons would be indefensible. Set any limit
      to 0 for unlimited.
    </p>

    <section className="mt-8">
      <h2 className="font-serif text-2xl">Base plans</h2>
      <p className="mt-1 text-sm text-[#737174]">What a salon starts on. Sized by branches and staff, because that is what a salon knows about itself.</p>
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
    </section>

    <section className="mt-10">
      <h2 className="font-serif text-2xl">Add-on packs</h2>
      <p className="mt-1 text-sm text-[#737174]">
        For a salon that needs more of one thing, not more of everything. A salon on Group with five
        branches and no bookings left does not need Franchise — it needs 500 more bookings.
      </p>
      <div className="mt-4">
        <AddOnsEditor addOns={addOns.map((addOn) => ({
          id: addOn.id, code: addOn.code, name: addOn.name, description: addOn.description,
          limitField: addOn.limitField, unitAmount: addOn.unitAmount,
          unitPrice: addOn.unitPricePaise / 100,
          isMetered: addOn.isMetered, isActive: addOn.isActive, sortOrder: addOn.sortOrder,
          subscribers: addOn._count.subscriptions,
        }))} />
      </div>
    </section>
  </>;
}
