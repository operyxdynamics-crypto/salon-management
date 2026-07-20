import { PageHeader } from "@/components/platform-admin/shell";
import { TodayQueue } from "@/components/platform-admin/today-queue";
import { buildWorklist, type LimitRow } from "@/lib/admin-worklist";
import { effectiveLimits, nearingLimits, remedyFor } from "@/lib/packages";
import { LIMIT_LABEL, monthStart, toAddOnLines } from "@/lib/platform-admin-queries";
import { monthlyValuePaise } from "@/lib/subscription-value";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today · Operyx" };

/**
 * The work queue.
 *
 * Loads only what the queue needs - subscriptions, pending branches, leads with a follow-up date,
 * and usage against limits. The old single-page console pulled every salon's branches, documents,
 * notes, invitations and audit history on first paint regardless of what you wanted to look at.
 */
export default async function DashboardPage() {
  const [tenants, leads, addOnCatalogue] = await Promise.all([
    db.tenant.findMany({
      select: {
        id: true, name: true, createdAt: true,
        // Prices as well as the name: MRR is computed from these, and selecting only the name
        // would leave the total silently at zero.
        subscriptionRecord: {
          include: {
            plan: { select: { name: true, monthlyPricePaise: true, annualPricePaise: true, maxBranches: true, maxStaff: true, maxServices: true, maxMonthlyAppointments: true } },
            addOns: { include: { addOn: true } },
          },
        },
        branches: {
          select: { id: true, name: true, publicationStatus: true, submittedAt: true, _count: { select: { appointments: true, staff: true } } },
        },
      },
    }),
    db.lead.findMany({
      where: { convertedTenantId: null, followUpAt: { not: null }, status: { notIn: ["WON", "LOST"] } },
      select: { id: true, salonName: true, contactName: true, followUpAt: true, status: true },
    }),
    db.addOn.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  // Bookings this month per branch, in one query rather than one per salon.
  const bookings = await db.appointment.groupBy({
    by: ["branchId"],
    where: { startsAt: { gte: monthStart() } },
    _count: { _all: true },
  });
  const bookingsByBranch = new Map(bookings.map((row) => [row.branchId, row._count._all]));

  /**
   * Paying salons pressing against a ceiling.
   *
   * Trials are left out on purpose. A trial hitting a limit is a product conversation, not a sales
   * call - asking someone to buy an add-on before they have bought the plan is the wrong order.
   */
  const limits: LimitRow[] = tenants.flatMap((tenant) => {
    const subscription = tenant.subscriptionRecord;
    if (!subscription?.plan) return [];
    if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") return [];

    const packs = toAddOnLines(subscription.addOns);
    const checks = nearingLimits(effectiveLimits(subscription.plan, packs), {
      maxBranches: tenant.branches.length,
      maxStaff: tenant.branches.reduce((sum, branch) => sum + branch._count.staff, 0),
      maxMonthlyAppointments: tenant.branches.reduce((sum, branch) => sum + (bookingsByBranch.get(branch.id) ?? 0), 0),
    });

    return checks.map((check) => {
      const remedy = remedyFor(check.field, addOnCatalogue);
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        label: LIMIT_LABEL[check.field] ?? check.field,
        used: check.used,
        limit: check.limit,
        percent: check.percent,
        // The alert carries its own solution, priced, so the call writes itself.
        remedy: remedy ? `${remedy.name} (+${remedy.unitAmount.toLocaleString("en-IN")}, ₹${(remedy.unitPricePaise / 100).toLocaleString("en-IN")}/mo)` : null,
      };
    });
  });

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
    limits,
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
