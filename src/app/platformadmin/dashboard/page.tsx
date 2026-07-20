import { PageHeader } from "@/components/platform-admin/shell";
import { TodayQueue } from "@/components/platform-admin/today-queue";
import { buildWorklist } from "@/lib/admin-worklist";
import { monthlyValuePaise } from "@/lib/subscription-value";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today · Operyx" };

/**
 * The work queue.
 *
 * Loads only what the queue needs - subscriptions, pending branches and leads with a follow-up
 * date. The old single-page console pulled every salon's branches, documents, notes, invitations
 * and audit history on first paint regardless of what you wanted to look at.
 */
export default async function DashboardPage() {
  const [tenants, leads] = await Promise.all([
    db.tenant.findMany({
      select: {
        id: true, name: true, createdAt: true,
        // Prices as well as the name: MRR is computed from these, and selecting only the name
        // would leave the total silently at zero.
        subscriptionRecord: { include: { plan: { select: { name: true, monthlyPricePaise: true, annualPricePaise: true } } } },
        branches: {
          select: { name: true, publicationStatus: true, submittedAt: true, _count: { select: { appointments: true } } },
        },
      },
    }),
    db.lead.findMany({
      where: { convertedTenantId: null, followUpAt: { not: null } },
      select: { id: true, salonName: true, contactName: true, followUpAt: true, status: true },
    }),
  ]);

  const worklist = buildWorklist({
    // `plan` is required by the schema, but a subscription whose plan was removed would crash the
    // whole page on `plan.name`. The control room must never be the thing that is down.
    subscriptions: tenants.flatMap((tenant) => tenant.subscriptionRecord?.plan ? [{
      tenantId: tenant.id,
      tenantName: tenant.name,
      status: tenant.subscriptionRecord.status,
      planName: tenant.subscriptionRecord.plan.name,
      trialEndsAt: tenant.subscriptionRecord.trialEndsAt,
      currentPeriodEnd: tenant.subscriptionRecord.currentPeriodEnd,
      pastDueSince: tenant.subscriptionRecord.pastDueSince,
      hasActivity: tenant.branches.some((branch) => branch._count.appointments > 0),
      createdAt: tenant.createdAt,
    }] : []),
    pendingBranches: tenants.flatMap((tenant) => tenant.branches
      .filter((branch) => branch.publicationStatus === "PENDING_REVIEW")
      .map((branch) => ({ tenantId: tenant.id, tenantName: tenant.name, branchName: branch.name, submittedAt: branch.submittedAt }))),
    leads: leads.map((lead) => ({ id: lead.id, salonName: lead.salonName, contactName: lead.contactName, followUpAt: lead.followUpAt, status: lead.status })),
  });

  const subscriptions = tenants.flatMap((tenant) => tenant.subscriptionRecord ? [tenant.subscriptionRecord] : []);
  const metrics = {
    mrr: subscriptions.reduce((sum, record) => sum + monthlyValuePaise(record), 0) / 100,
    paying: subscriptions.filter((record) => record.status === "ACTIVE").length,
    trialing: subscriptions.filter((record) => record.status === "TRIALING").length,
    pastDue: subscriptions.filter((record) => record.status === "PAST_DUE").length,
  };

  return <>
    <PageHeader
      title="Today"
      blurb={worklist.length ? `${worklist.length} thing${worklist.length === 1 ? "" : "s"} need you, ordered by what it costs to ignore.` : "Nothing needs you right now."}
    />
    <TodayQueue items={worklist.map((item) => ({ kind: item.kind, id: item.id, title: item.title, detail: item.detail }))} metrics={metrics} />
  </>;
}
