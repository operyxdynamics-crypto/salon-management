import { PageHeader } from "@/components/platform-admin/shell";
import { PipelineBoard } from "@/components/platform-admin/pipeline-board";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pipeline · Operyx" };

type StoredQuoteLine = { code: string; name: string; quantity: number; unitAmount: number; unitPricePaise: number };

/**
 * Who am I about to win?
 *
 * A prospect is not a salon - no login, no subscription, nothing to bill. Recording them as a
 * tenant would fill the database with half-real salons and quietly ruin every number that matters:
 * active salons, MRR, conversion rate. So a lead lives on its own until it converts, and only then
 * becomes a trial.
 */
export default async function PipelinePage() {
  const [leads, plans, addOns] = await Promise.all([
    db.lead.findMany({
      where: { convertedTenantId: null },
      include: { interestedPlan: { select: { name: true } } },
      // Whoever needs chasing soonest, first. No follow-up date sorts last - which is where an
      // un-actioned lead belongs until someone commits to a date.
      orderBy: [{ followUpAt: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
    db.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, monthlyPricePaise: true, maxBranches: true, maxStaff: true, maxServices: true, maxMonthlyAppointments: true },
    }),
    db.addOn.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { code: true, name: true, limitField: true, unitAmount: true, unitPricePaise: true, isMetered: true },
    }),
  ]);

  const overdue = leads.filter((lead) => lead.followUpAt && lead.followUpAt < new Date() && lead.status !== "LOST").length;
  const noNextStep = leads.filter((lead) => !lead.followUpAt && !["WON", "LOST"].includes(lead.status)).length;
  // Only quoted leads carry a real number. Counting the rest would be optimism, not a forecast.
  const quotedValue = leads
    .filter((lead) => !["WON", "LOST"].includes(lead.status))
    .reduce((sum, lead) => sum + (lead.quotedMonthlyPaise ?? 0), 0) / 100;

  return <>
    <PageHeader
      title="Pipeline"
      blurb={overdue
        ? `${overdue} follow-up${overdue === 1 ? "" : "s"} overdue.`
        : quotedValue > 0
          ? `${inr.format(quotedValue)} a month quoted and still open.`
          : "Leads from Meta, referrals and walk-ins, from first call to closing."}
      action={noNextStep ? (
        <span className="rounded-xl bg-[#FDECEC] px-3.5 py-2 text-xs font-bold text-[#94302E]">
          {noNextStep} with no next step
        </span>
      ) : undefined}
    />

    <PipelineBoard
      plans={plans}
      addOns={addOns}
      leads={leads.map((lead) => ({
        id: lead.id, salonName: lead.salonName, contactName: lead.contactName, phone: lead.phone,
        email: lead.email, city: lead.city, branchCount: lead.branchCount, staffCount: lead.staffCount,
        source: lead.source, status: lead.status, notes: lead.notes,
        interestedPlanId: lead.interestedPlanId,
        interestedPlan: lead.interestedPlan?.name ?? null,
        followUpAt: lead.followUpAt?.toISOString() ?? null,
        quotedMonthly: lead.quotedMonthlyPaise === null ? null : lead.quotedMonthlyPaise / 100,
        quotedAt: lead.quotedAt?.toISOString() ?? null,
        quotedAddOns: Array.isArray(lead.quotedAddOns) ? (lead.quotedAddOns as unknown as StoredQuoteLine[]) : [],
      }))}
    />
  </>;
}
