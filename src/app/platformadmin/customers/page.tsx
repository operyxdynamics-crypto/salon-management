import Link from "next/link";
import { PageHeader } from "@/components/platform-admin/shell";
import { assessHealth } from "@/lib/customer-health";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { LIMIT_LABEL, PAYING_STATUSES, monthStart, toAddOnLines } from "@/lib/platform-admin-queries";
import { effectiveLimits, nearingLimits } from "@/lib/packages";
import { monthlyValuePaise } from "@/lib/subscription-value";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers · Operyx" };

const DAY = 86_400_000;

const BAND_STYLE: Record<string, string> = {
  DORMANT: "bg-[#FDECEC] text-[#94302E]",
  AT_RISK: "bg-[#FFF7DF] text-[#865C12]",
  WATCH: "bg-[#FFF7DF] text-[#865C12]",
  NEW: "bg-[#F3E8FF] text-[#5B2A86]",
  HEALTHY: "bg-[#E9F7F1] text-[#0B6B4F]",
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-[#0B6B4F]",
  PAST_DUE: "text-[#94302E]",
  SUSPENDED: "text-[#94302E]",
  CANCELLED: "text-[#9CA3AF]",
};

/**
 * Which of my customers is in trouble?
 *
 * Paying salons only. A trialling salon used to appear here, which made a free salon look like a
 * customer and gave "how many customers do we have?" two different answers depending on which
 * screen you asked. It now has one.
 *
 * Sorted by health rather than by name. A directory sorted alphabetically tells you nothing; the
 * salon that stopped billing three weeks ago should be the first thing on the page, because it is
 * the one about to cancel.
 */
export default async function CustomersPage() {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const twoWeeksAgo = new Date(now - 14 * DAY);

  const tenants = await db.tenant.findMany({
    where: { subscriptionRecord: { status: { in: [...PAYING_STATUSES] } } },
    select: {
      id: true, name: true, createdAt: true,
      subscriptionRecord: {
        include: {
          plan: { select: { name: true, monthlyPricePaise: true, annualPricePaise: true, maxBranches: true, maxStaff: true, maxServices: true, maxMonthlyAppointments: true } },
          addOns: { include: { addOn: true } },
        },
      },
      _count: { select: { branches: true, customers: true } },
      branches: {
        select: {
          id: true,
          _count: { select: { invoices: true, staff: true } },
          invoices: { where: { createdAt: { gte: twoWeeksAgo } }, select: { createdAt: true } },
        },
      },
    },
  });

  // Bookings this month, counted in one query rather than one per salon.
  const bookings = await db.appointment.groupBy({
    by: ["branchId"],
    where: { branchId: { in: tenants.flatMap((tenant) => tenant.branches.map((branch) => branch.id)) }, startsAt: { gte: monthStart() } },
    _count: { _all: true },
  });
  const bookingsByBranch = new Map(bookings.map((row) => [row.branchId, row._count._all]));

  const rows = tenants.map((tenant) => {
    const subscription = tenant.subscriptionRecord!;
    const invoiceDates = tenant.branches.flatMap((branch) => branch.invoices.map((invoice) => invoice.createdAt));
    const everBilled = tenant.branches.reduce((sum, branch) => sum + branch._count.invoices, 0) > 0;
    const latest = invoiceDates.length ? Math.max(...invoiceDates.map((date) => date.getTime())) : null;

    const health = assessHealth({
      billsThisWeek: invoiceDates.filter((date) => date >= weekAgo).length,
      billsLastWeek: invoiceDates.filter((date) => date < weekAgo).length,
      // Never billed at all is null; billed but not in the last fortnight reads as 14+.
      daysSinceLastBill: latest ? Math.floor((now - latest) / DAY) : everBilled ? 14 : null,
      ageDays: Math.floor((now - tenant.createdAt.getTime()) / DAY),
    });

    const packs = toAddOnLines(subscription.addOns);

    return {
      tenant,
      subscription,
      health,
      packCount: subscription.addOns.reduce((sum, line) => sum + line.quantity, 0),
      mrr: monthlyValuePaise(subscription) / 100,
      // Room left on the plan they are actually on, packs included - the ceiling they will hit.
      near: nearingLimits(effectiveLimits(subscription.plan, packs), {
        maxBranches: tenant._count.branches,
        maxStaff: tenant.branches.reduce((sum, branch) => sum + branch._count.staff, 0),
        maxMonthlyAppointments: tenant.branches.reduce((sum, branch) => sum + (bookingsByBranch.get(branch.id) ?? 0), 0),
      }),
    };
  }).sort((left, right) => left.health.rank - right.health.rank || right.mrr - left.mrr);

  const needAttention = rows.filter((row) => row.health.rank <= 1).length;
  const expansion = rows.filter((row) => row.near.length).length;
  const mrr = rows.reduce((sum, row) => sum + row.mrr, 0);

  return <>
    <PageHeader
      title="Customers"
      blurb={needAttention
        ? `${needAttention} showing signs of trouble. Worst first.`
        : `${rows.length} paying salon${rows.length === 1 ? "" : "s"}, ${inr.format(mrr)} a month. Worst health first.`}
      action={expansion ? (
        <span className="rounded-xl bg-[#F3E8FF] px-3.5 py-2 text-xs font-bold text-[#5B2A86]">
          {expansion} near a limit — worth a call
        </span>
      ) : undefined}
    />

    <div className="mt-6 overflow-hidden rounded-2xl border border-[#EFEAF3] bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#F7F6F9] text-xs uppercase tracking-wider text-[#9CA3AF]">
          <tr>
            <th className="p-4">Salon</th><th className="p-4">Health</th><th className="p-4">Package</th>
            <th className="p-4">Size</th><th className="p-4 text-right">MRR</th><th className="p-4"></th>
          </tr>
        </thead>
        <tbody>{rows.map(({ tenant, subscription, health, mrr: value, packCount, near }) => (
          <tr key={tenant.id} className="border-t border-[#EFEAF3]">
            <td className="p-4">
              <strong>{tenant.name}</strong>
              <p className="text-xs text-[#9CA3AF]">{tenant._count.customers} customers</p>
            </td>
            <td className="p-4">
              <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${BAND_STYLE[health.band]}`}>
                {health.band.replace("_", " ")}
              </span>
              {/* The evidence, not a score. A human decides holding the same facts we did. */}
              <p className="mt-1 text-xs text-[#6B7280]">{health.evidence.join(" · ")}</p>
            </td>
            <td className="p-4">
              {subscription.plan.name}
              {packCount > 0 && <span className="ml-1.5 rounded bg-[#F3E8FF] px-1.5 py-0.5 text-[10px] font-bold text-[#5B2A86]">+{packCount} pack{packCount === 1 ? "" : "s"}</span>}
              <p className={`text-xs font-semibold ${STATUS_STYLE[subscription.status] ?? "text-[#9CA3AF]"}`}>
                {subscription.status.toLowerCase().replace("_", " ")}
              </p>
            </td>
            <td className="p-4 text-xs text-[#6B7280]">
              {tenant._count.branches} branch{tenant._count.branches === 1 ? "" : "es"}
              {/* Shown as an offer, not an error. That is the whole difference between a limit that
                  annoys customers and one that grows revenue. */}
              {near.map((check) => (
                <p key={check.field} className="mt-1 font-semibold text-[#865C12]">
                  {check.percent}% of {LIMIT_LABEL[check.field]}
                </p>
              ))}
            </td>
            <td className="p-4 text-right font-bold">{value > 0 ? inr.format(value) : "—"}</td>
            <td className="p-4 text-right">
              <Link href={`/platformadmin/customers/${tenant.id}`} className="rounded-lg border border-[#E3D9EE] px-3 py-1.5 text-xs font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">Open</Link>
            </td>
          </tr>
        ))}</tbody>
      </table>
      {!rows.length && (
        <p className="p-12 text-center text-sm text-[#9CA3AF]">
          No paying customers yet. Salons on a free trial are under{" "}
          <Link href="/platformadmin/trials" className="font-bold text-[#5B2A86]">Trials</Link>.
        </p>
      )}
    </div>
  </>;
}
