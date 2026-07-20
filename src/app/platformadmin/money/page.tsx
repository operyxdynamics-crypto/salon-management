import { PageHeader } from "@/components/platform-admin/shell";
import { computeChurn } from "@/lib/customer-health";
import { grossRevenueRetention, netRevenueRetention } from "@/lib/subscription-events";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { monthlyValuePaise } from "@/lib/subscription-value";

export const dynamic = "force-dynamic";
export const metadata = { title: "Money · Operyx" };

/**
 * Am I growing or shrinking?
 *
 * MRR alone answers neither. A company can grow revenue while losing a fifth of its customers - the
 * growth is real and the business is dying. So churn sits next to MRR, not on a separate page
 * nobody opens.
 */
export default async function MoneyPage() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [subscriptions, plans, cancelledThisMonth, wonThisMonth, events] = await Promise.all([
    db.tenantSubscription.findMany({
      include: { plan: { select: { id: true, name: true, monthlyPricePaise: true, annualPricePaise: true } }, tenant: { select: { name: true } } },
    }),
    db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.tenantSubscription.findMany({
      where: { status: "CANCELLED", cancelledAt: { gte: monthStart } },
      include: { plan: { select: { monthlyPricePaise: true, annualPricePaise: true } }, tenant: { select: { name: true } } },
    }),
    db.tenantSubscription.count({ where: { status: "ACTIVE", startsAt: { gte: monthStart } } }),
    // The event log is what makes retention computable at all. Only movements that shift money.
    db.subscriptionEvent.findMany({
      where: { createdAt: { gte: monthStart }, kind: { in: ["UPGRADED", "DOWNGRADED", "PRICE_CHANGED", "CANCELLED"] } },
      select: { kind: true, fromValuePaise: true, toValuePaise: true },
    }),
  ]);

  const live = subscriptions.filter((record) => record.status === "ACTIVE" || record.status === "PAST_DUE");
  const mrr = live.reduce((sum, record) => sum + monthlyValuePaise(record), 0) / 100;

  // A cancelled subscription is worth zero *now*, so value it as if it were still active to learn
  // what walking away actually cost.
  const cancelledMrr = cancelledThisMonth.reduce((sum, record) => sum + monthlyValuePaise({ ...record, status: "ACTIVE" }), 0) / 100;
  const newMrr = live.filter((record) => record.startsAt >= monthStart).reduce((sum, record) => sum + monthlyValuePaise(record), 0) / 100;

  const churn = computeChurn({
    startingCustomers: live.length + cancelledThisMonth.length,
    cancelled: cancelledThisMonth.length,
    cancelledMrr,
    startingMrr: mrr + cancelledMrr,
    newMrr,
  });

  /**
   * Net revenue retention — whether the customers we already have are worth more over time.
   *
   * New sales are deliberately excluded: including them would let a good month hide a retention
   * problem, which is precisely the failure this number exists to prevent.
   */
  const movement = events.reduce((totals, event) => {
    const from = (event.fromValuePaise ?? 0) / 100;
    const to = (event.toValuePaise ?? 0) / 100;
    if (event.kind === "CANCELLED") totals.churned += from;
    else if (to > from) totals.expansion += to - from;
    else if (to < from) totals.contraction += from - to;
    return totals;
  }, { expansion: 0, contraction: 0, churned: 0 });

  const startingMrr = mrr + cancelledMrr - newMrr;
  const nrr = netRevenueRetention({ startingMrr, ...movement });
  const grr = grossRevenueRetention({ startingMrr, ...movement });

  const byPlan = plans.map((plan) => {
    const subscribers = live.filter((record) => record.planId === plan.id && record.status === "ACTIVE");
    return { plan, count: subscribers.length, mrr: subscribers.reduce((sum, record) => sum + monthlyValuePaise(record), 0) / 100 };
  });

  const reasons = cancelledThisMonth.reduce<Record<string, number>>((counts, record) => {
    const reason = record.cancelReason || "No reason recorded";
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});

  return <>
    <PageHeader title="Money" blurb="Recurring revenue, what it's losing, and where it comes from." />

    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-[#5B2A86] p-4 text-white">
        <p className="text-xs text-white/70">Monthly recurring revenue</p>
        <strong className="mt-1 block text-3xl">{inr.format(mrr)}</strong>
        <p className="mt-1 text-xs text-white/60">Annual ÷ 12 · trials excluded</p>
      </div>
      <div className="rounded-2xl border border-[#EFEAF3] bg-white p-4">
        <p className="text-xs text-[#737174]">Net change this month</p>
        <strong className={`mt-1 block text-3xl ${churn.growing ? "text-[#0B6B4F]" : churn.netMrrChange < 0 ? "text-[#C4403E]" : ""}`}>
          {churn.netMrrChange >= 0 ? "+" : ""}{inr.format(churn.netMrrChange)}
        </strong>
        <p className="mt-1 text-xs text-[#9CA3AF]">{inr.format(newMrr)} won · {inr.format(cancelledMrr)} lost</p>
      </div>
      <div className="rounded-2xl border border-[#EFEAF3] bg-white p-4">
        <p className="text-xs text-[#737174]">Revenue churn</p>
        <strong className={`mt-1 block text-3xl ${churn.revenueChurnPercent > 5 ? "text-[#C4403E]" : ""}`}>{churn.revenueChurnPercent}%</strong>
        <p className="mt-1 text-xs text-[#9CA3AF]">{churn.customerChurnPercent}% of customers</p>
      </div>
      {/* Net revenue retention: the one number that says whether the base itself is growing.
          Above 100% the company survives a bad sales month; below, every new customer is
          replacing one already lost. */}
      <div className="rounded-2xl border border-[#EFEAF3] bg-white p-4">
        <p className="text-xs text-[#737174]">Net revenue retention</p>
        <strong className={`mt-1 block text-3xl ${nrr >= 100 ? "text-[#0B6B4F]" : nrr > 0 ? "text-[#C4403E]" : ""}`}>
          {startingMrr > 0 ? `${nrr}%` : "—"}
        </strong>
        <p className="mt-1 text-xs text-[#9CA3AF]">
          {startingMrr > 0 ? `${grr}% without upgrades` : "Needs a full month of history"}
        </p>
      </div>
    </div>

    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {([
        ["Won this month", `${wonThisMonth} salon${wonThisMonth === 1 ? "" : "s"}`, ""],
        ["Expansion", inr.format(movement.expansion), movement.expansion > 0 ? "text-[#0B6B4F]" : ""],
        ["Contraction", inr.format(movement.contraction + movement.churned), movement.contraction + movement.churned > 0 ? "text-[#C4403E]" : ""],
      ] as const).map(([text, value, cls]) => (
        <div key={text} className="rounded-2xl border border-[#EFEAF3] bg-white p-4">
          <p className="text-xs text-[#737174]">{text}</p>
          <strong className={`mt-1 block text-xl ${cls}`}>{value}</strong>
        </div>
      ))}
    </div>

    <section className="mt-5 rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <h2 className="font-serif text-2xl">Revenue by plan</h2>
      <p className="mt-1 text-sm text-[#737174]">Where the money comes from — worth knowing before changing a price.</p>
      <table className="mt-5 w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-[#9CA3AF]">
          <tr><th className="pb-3">Plan</th><th className="pb-3">List price</th><th className="pb-3">Paying</th><th className="pb-3 text-right">MRR</th><th className="pb-3 text-right">Share</th></tr>
        </thead>
        <tbody>{byPlan.map(({ plan, count, mrr: planMrr }) => (
          <tr key={plan.id} className="border-t border-[#EFEAF3]">
            <td className="py-3 font-bold">{plan.name}</td>
            <td className="py-3 text-[#737174]">{inr.format(plan.monthlyPricePaise / 100)}/mo</td>
            <td className="py-3">{count}</td>
            <td className="py-3 text-right font-bold">{inr.format(planMrr)}</td>
            <td className="py-3 text-right text-[#737174]">{mrr > 0 ? Math.round((planMrr / mrr) * 100) : 0}%</td>
          </tr>
        ))}</tbody>
      </table>
    </section>

    {/* Why customers leave is the most valuable data this company collects. If this box is empty,
        nobody is recording a reason on cancellation - and that is a process problem, not a bug. */}
    <section className="mt-5 rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <h2 className="font-serif text-2xl">Why they left</h2>
      {cancelledThisMonth.length === 0 ? (
        <p className="mt-3 text-sm text-[#737174]">No cancellations this month.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {Object.entries(reasons).sort(([, left], [, right]) => right - left).map(([reason, count]) => (
            <div key={reason} className="flex items-center justify-between rounded-xl bg-[#F7F6F9] px-4 py-2.5 text-sm">
              <span className={reason === "No reason recorded" ? "italic text-[#9CA3AF]" : ""}>{reason}</span>
              <strong>{count}</strong>
            </div>
          ))}
          <p className="pt-2 text-xs text-[#9CA3AF]">
            {cancelledThisMonth.map((record) => record.tenant.name).join(", ")}
          </p>
        </div>
      )}
    </section>
  </>;
}
