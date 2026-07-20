import { PageHeader } from "@/components/platform-admin/shell";
import { EnquiryBoard } from "@/components/platform-admin/enquiry-board";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enquiries · Operyx" };

/**
 * The pipeline.
 *
 * A prospect is not a salon - no login, no subscription, nothing to bill. Recording them as a
 * tenant would fill the database with half-real salons and quietly ruin every number that matters:
 * active salons, MRR, conversion rate.
 */
export default async function EnquiriesPage() {
  const [leads, plans] = await Promise.all([
    db.lead.findMany({
      where: { convertedTenantId: null },
      include: { interestedPlan: { select: { name: true } } },
      // Whoever needs chasing soonest, first. No follow-up date sorts last - which is where an
      // un-actioned enquiry belongs until someone commits to a date.
      orderBy: [{ followUpAt: "asc" }, { createdAt: "desc" }],
    }),
    db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const overdue = leads.filter((lead) => lead.followUpAt && lead.followUpAt < new Date()).length;

  return <>
    <PageHeader
      title="Enquiries"
      blurb={overdue ? `${overdue} follow-up${overdue === 1 ? "" : "s"} overdue.` : "Salons that have enquired but haven't signed up yet."}
    />
    <EnquiryBoard
      plans={plans}
      leads={leads.map((lead) => ({
        id: lead.id, salonName: lead.salonName, contactName: lead.contactName, phone: lead.phone,
        email: lead.email, city: lead.city, branchCount: lead.branchCount, staffCount: lead.staffCount,
        source: lead.source, status: lead.status, notes: lead.notes,
        interestedPlan: lead.interestedPlan?.name ?? null,
        followUpAt: lead.followUpAt?.toISOString() ?? null,
      }))}
    />
  </>;
}
