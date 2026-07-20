import Link from "next/link";
import { PageHeader } from "@/components/platform-admin/shell";
import { assessHealth } from "@/lib/customer-health";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { monthlyValuePaise } from "@/lib/subscription-value";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients · Operyx" };

const DAY = 86_400_000;

const BAND_STYLE: Record<string, string> = {
  DORMANT: "bg-[#FDECEC] text-[#94302E]",
  AT_RISK: "bg-[#FFF7DF] text-[#865C12]",
  WATCH: "bg-[#FFF7DF] text-[#865C12]",
  NEW: "bg-[#F3E8FF] text-[#5B2A86]",
  HEALTHY: "bg-[#E9F7F1] text-[#0B6B4F]",
};

/**
 * Which of my customers is in trouble?
 *
 * Sorted by health rather than by name. A directory sorted alphabetically tells you nothing; the
 * salon that stopped billing three weeks ago should be the first thing on the page, because it is
 * the one about to cancel.
 */
export default async function ClientsPage() {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const twoWeeksAgo = new Date(now - 14 * DAY);

  const tenants = await db.tenant.findMany({
    select: {
      id: true, name: true, slug: true, status: true, createdAt: true,
      subscriptionRecord: { include: { plan: { select: { name: true, monthlyPricePaise: true, annualPricePaise: true } } } },
      _count: { select: { branches: true, customers: true } },
      branches: {
        select: {
          invoices: {
            where: { createdAt: { gte: twoWeeksAgo } },
            select: { createdAt: true },
          },
          _count: { select: { invoices: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = tenants.map((tenant) => {
    const invoiceDates = tenant.branches.flatMap((branch) => branch.invoices.map((invoice) => invoice.createdAt));
    const billsThisWeek = invoiceDates.filter((date) => date >= weekAgo).length;
    const billsLastWeek = invoiceDates.filter((date) => date < weekAgo).length;
    const everBilled = tenant.branches.reduce((sum, branch) => sum + branch._count.invoices, 0) > 0;
    const latest = invoiceDates.length ? Math.max(...invoiceDates.map((date) => date.getTime())) : null;

    const health = assessHealth({
      billsThisWeek,
      billsLastWeek,
      // Never billed at all is null; billed but not in the last fortnight reads as 14+.
      daysSinceLastBill: latest ? Math.floor((now - latest) / DAY) : everBilled ? 14 : null,
      ageDays: Math.floor((now - tenant.createdAt.getTime()) / DAY),
    });

    return {
      tenant,
      health,
      mrr: tenant.subscriptionRecord ? monthlyValuePaise(tenant.subscriptionRecord) / 100 : 0,
    };
  }).sort((left, right) => left.health.rank - right.health.rank || right.mrr - left.mrr);

  const needAttention = rows.filter((row) => row.health.rank <= 1).length;

  return <>
    <PageHeader
      title="Clients"
      blurb={needAttention ? `${needAttention} salon${needAttention === 1 ? "" : "s"} showing signs of trouble. Worst first.` : "Every salon on Operyx. Worst health first."}
    />

    <div className="mt-6 overflow-hidden rounded-2xl border border-[#EFEAF3] bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#F7F6F9] text-xs uppercase tracking-wider text-[#9CA3AF]">
          <tr>
            <th className="p-4">Salon</th><th className="p-4">Health</th><th className="p-4">Plan</th>
            <th className="p-4">Size</th><th className="p-4 text-right">MRR</th><th className="p-4"></th>
          </tr>
        </thead>
        <tbody>{rows.map(({ tenant, health, mrr }) => (
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
              {tenant.subscriptionRecord?.plan.name ?? <span className="text-[#9CA3AF]">No plan</span>}
              {tenant.subscriptionRecord && <p className="text-xs text-[#9CA3AF]">{tenant.subscriptionRecord.status.toLowerCase().replace("_", " ")}</p>}
            </td>
            <td className="p-4 text-xs text-[#6B7280]">{tenant._count.branches} branch{tenant._count.branches === 1 ? "" : "es"}</td>
            <td className="p-4 text-right font-bold">{mrr > 0 ? inr.format(mrr) : "—"}</td>
            <td className="p-4 text-right">
              <Link href={`/platformadmin/clients/${tenant.id}`} className="rounded-lg border border-[#E3D9EE] px-3 py-1.5 text-xs font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">Open</Link>
            </td>
          </tr>
        ))}</tbody>
      </table>
      {!rows.length && <p className="p-12 text-center text-sm text-[#9CA3AF]">No salons yet.</p>}
    </div>
  </>;
}
