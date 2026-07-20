import Link from "next/link";
import { PageHeader } from "@/components/platform-admin/shell";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { TRIAL_STATUSES } from "@/lib/platform-admin-queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trials · Operyx" };

const DAY = 86_400_000;

/**
 * Who is about to convert, and who is about to slip away?
 *
 * Trials get their own screen because they need the opposite of what customers need. A customer is
 * watched for signs of leaving; a trial is watched for signs of *using it*, and the window to act
 * is days rather than months. Mixing them meant the salon with four days left sat halfway down a
 * list sorted by something that did not matter to it.
 *
 * Sorted by days remaining, soonest first. A trial with two days left and no bookings is the most
 * urgent thing on this page, and it should be at the top of it.
 */
export default async function TrialsPage() {
  const now = Date.now();

  const tenants = await db.tenant.findMany({
    where: {
      OR: [
        { subscriptionRecord: { status: { in: [...TRIAL_STATUSES] } } },
        // A salon set up but never given a plan is functionally on trial. It is certainly not a
        // customer, and leaving it out of every list is how a salon gets forgotten entirely.
        { subscriptionRecord: null },
      ],
    },
    select: {
      id: true, name: true, createdAt: true, status: true,
      subscriptionRecord: { include: { plan: { select: { name: true, monthlyPricePaise: true, trialDays: true } } } },
      ownerInvitations: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      _count: { select: { branches: true, customers: true, services: true } },
      branches: { select: { _count: { select: { invoices: true, staff: true } } } },
    },
  });

  const rows = tenants.map((tenant) => {
    const subscription = tenant.subscriptionRecord;
    const endsAt = subscription?.trialEndsAt ?? null;
    const daysLeft = endsAt ? Math.ceil((endsAt.getTime() - now) / DAY) : null;
    const invoices = tenant.branches.reduce((sum, branch) => sum + branch._count.invoices, 0);
    const staff = tenant.branches.reduce((sum, branch) => sum + branch._count.staff, 0);

    /**
     * Has this salon actually started using it?
     *
     * Bills raised is the only honest signal. Services and staff can be typed in during a demo call
     * and prove nothing; a real invoice means a real customer paid them while using Operyx, and
     * that is the salon that will renew.
     */
    const engaged = invoices > 0;
    const setup = tenant._count.services > 0 && staff > 0;

    return {
      tenant, subscription, daysLeft, invoices, staff, engaged, setup,
      invited: tenant.ownerInvitations[0]?.status ?? null,
      // Expired first, then closest to expiring. Null (no end date set) sorts last.
      sortKey: daysLeft ?? 9_999,
    };
  }).sort((left, right) => left.sortKey - right.sortKey);

  const expiring = rows.filter((row) => row.daysLeft !== null && row.daysLeft <= 3).length;
  const dormant = rows.filter((row) => !row.engaged).length;
  const potential = rows.reduce((sum, row) => sum + (row.subscription?.plan.monthlyPricePaise ?? 0), 0) / 100;

  return <>
    <PageHeader
      title="Trials"
      blurb={rows.length
        ? `${rows.length} salon${rows.length === 1 ? "" : "s"} trying Operyx, worth ${inr.format(potential)}/month if they all convert. Soonest to expire first.`
        : "No trials running."}
      action={expiring ? (
        <span className="rounded-xl bg-[#FDECEC] px-3.5 py-2 text-xs font-bold text-[#94302E]">
          {expiring} expiring within 3 days
        </span>
      ) : undefined}
    />

    {dormant > 0 && rows.length > 0 && (
      <p className="mt-4 rounded-xl border border-[#F3E4C0] bg-[#FFFBF0] px-4 py-3 text-sm text-[#865C12]">
        <strong>{dormant}</strong> {dormant === 1 ? "trial has" : "trials have"} raised no bills yet. A trial
        that never bills will not convert, whatever they said on the call — ring them before the clock runs out.
      </p>
    )}

    <div className="mt-6 overflow-hidden rounded-2xl border border-[#EFEAF3] bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#F7F6F9] text-xs uppercase tracking-wider text-[#9CA3AF]">
          <tr>
            <th className="p-4">Salon</th><th className="p-4">Time left</th><th className="p-4">Using it?</th>
            <th className="p-4">Set up</th><th className="p-4 text-right">Worth</th><th className="p-4"></th>
          </tr>
        </thead>
        <tbody>{rows.map(({ tenant, subscription, daysLeft, invoices, staff, engaged, setup, invited }) => (
          <tr key={tenant.id} className="border-t border-[#EFEAF3]">
            <td className="p-4">
              <strong>{tenant.name}</strong>
              <p className="text-xs text-[#9CA3AF]">
                {subscription ? `${subscription.plan.name} trial` : "No plan assigned"}
                {invited === "PENDING" && " · owner not signed in yet"}
              </p>
            </td>
            <td className="p-4">
              {daysLeft === null ? (
                <span className="text-xs text-[#9CA3AF]">No end date set</span>
              ) : daysLeft <= 0 ? (
                <span className="rounded-full bg-[#FDECEC] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#94302E]">Expired</span>
              ) : (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${daysLeft <= 3 ? "bg-[#FFF7DF] text-[#865C12]" : "bg-[#F3E8FF] text-[#5B2A86]"}`}>
                  {daysLeft} day{daysLeft === 1 ? "" : "s"}
                </span>
              )}
            </td>
            <td className="p-4">
              {engaged
                ? <span className="text-xs font-semibold text-[#0B6B4F]">{invoices} bill{invoices === 1 ? "" : "s"} raised</span>
                : <span className="text-xs font-semibold text-[#94302E]">Not billing yet</span>}
            </td>
            <td className="p-4 text-xs text-[#6B7280]">
              {tenant._count.branches} branch{tenant._count.branches === 1 ? "" : "es"} · {staff} staff · {tenant._count.services} services
              {!setup && <p className="mt-0.5 font-semibold text-[#865C12]">Setup incomplete</p>}
            </td>
            <td className="p-4 text-right font-bold">
              {subscription ? inr.format(subscription.plan.monthlyPricePaise / 100) : "—"}
              <span className="block text-[10px] font-normal text-[#9CA3AF]">if converted</span>
            </td>
            <td className="p-4 text-right">
              <Link href={`/platformadmin/customers/${tenant.id}`} className="rounded-lg border border-[#E3D9EE] px-3 py-1.5 text-xs font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">Open</Link>
            </td>
          </tr>
        ))}</tbody>
      </table>
      {!rows.length && (
        <p className="p-12 text-center text-sm text-[#9CA3AF]">
          No trials running. Start one from a lead in{" "}
          <Link href="/platformadmin/pipeline" className="font-bold text-[#5B2A86]">Pipeline</Link>.
        </p>
      )}
    </div>
  </>;
}
