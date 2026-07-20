/**
 * What Operyx needs to act on today.
 *
 * The admin console used to be a filing cabinet: pick a salon, look at its record. That is fine for
 * looking something up and useless for running a business - nobody opens a filing cabinet to find
 * out which trial expires tomorrow. This turns the same data into a queue, ordered by what it costs
 * to ignore.
 *
 * Kept pure so the ordering can be tested. Getting this wrong means a renewal is missed quietly,
 * which is the most expensive kind of bug in a subscription business.
 */

export type WorkItemKind =
  | "PAST_DUE"
  | "TRIAL_ENDING"
  | "TRIAL_EXPIRED"
  | "RENEWAL_DUE"
  | "BRANCH_APPROVAL"
  | "AT_LIMIT"
  | "NEAR_LIMIT"
  | "LEAD_FOLLOW_UP"
  | "NEVER_ACTIVATED";

export type WorkItem = {
  kind: WorkItemKind;
  /** What the item is about - a salon or an enquiry. */
  id: string;
  title: string;
  detail: string;
  /** Lower sorts first. Derived, never hand-set, so the order is defensible. */
  urgency: number;
  /** Days until (positive) or since (negative) the thing happens. Null when not time-bound. */
  days: number | null;
};

const DAY = 86_400_000;
const daysUntil = (date: Date, now: Date) => Math.ceil((date.getTime() - now.getTime()) / DAY);

/**
 * How much each kind of problem costs to ignore, lowest first.
 *
 * Money already at risk outranks money not yet won. A failed payment is revenue actively leaking;
 * an expiring trial is revenue about to be lost; a lead is revenue that was never there. A branch
 * waiting on approval sits high because the salon is blocked and cannot use what they bought -
 * that is our fault, not theirs, and it churns customers faster than any pricing mistake.
 *
 * The two limit kinds sit at opposite ends for the same reason. A customer *at* their ceiling
 * cannot take a booking right now, which is worse than a trial ending today; a customer *near* it
 * is not hurt yet and is simply an easy sale, so it waits behind everything that is actually wrong.
 */
const BASE_URGENCY: Record<WorkItemKind, number> = {
  PAST_DUE: 0,
  TRIAL_EXPIRED: 100,
  BRANCH_APPROVAL: 200,
  AT_LIMIT: 250,
  TRIAL_ENDING: 300,
  RENEWAL_DUE: 400,
  NEVER_ACTIVATED: 500,
  NEAR_LIMIT: 550,
  LEAD_FOLLOW_UP: 600,
};

export type SubscriptionRow = {
  tenantId: string;
  tenantName: string;
  status: string;
  planName: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
  /** Has this salon ever actually used the product? */
  hasActivity: boolean;
  createdAt: Date;
};

export type PendingBranch = { tenantId: string; tenantName: string; branchName: string; submittedAt: Date | null };
export type LeadRow = { id: string; salonName: string; contactName: string; followUpAt: Date | null; status: string };

/** A paying salon pressing against one of its ceilings. Computed by `nearingLimits` in packages.ts. */
export type LimitRow = {
  tenantId: string;
  tenantName: string;
  /** Plain English: "bookings used". */
  label: string;
  used: number;
  limit: number;
  percent: number;
  /** The add-on that fixes it, so the alert carries its own solution. */
  remedy: string | null;
};

/** Trials and renewals inside this window are "coming up" rather than "someday". */
export const HORIZON_DAYS = 7;

export function buildWorklist(input: {
  subscriptions: SubscriptionRow[];
  pendingBranches: PendingBranch[];
  leads: LeadRow[];
  limits?: LimitRow[];
  now?: Date;
}): WorkItem[] {
  const now = input.now ?? new Date();
  const items: WorkItem[] = [];

  for (const row of input.subscriptions) {
    if (row.status === "PAST_DUE" && row.pastDueSince) {
      const since = Math.floor((now.getTime() - row.pastDueSince.getTime()) / DAY);
      items.push({
        kind: "PAST_DUE", id: row.tenantId, title: row.tenantName,
        detail: `Payment failed ${since} day${since === 1 ? "" : "s"} ago · ${row.planName}`,
        // The longer it has been failing, the closer to suspension - so it climbs.
        urgency: BASE_URGENCY.PAST_DUE - since, days: -since,
      });
      continue;
    }

    if (row.status === "TRIALING" && row.trialEndsAt) {
      const left = daysUntil(row.trialEndsAt, now);
      if (left < 0) {
        items.push({
          kind: "TRIAL_EXPIRED", id: row.tenantId, title: row.tenantName,
          detail: `Trial ended ${Math.abs(left)} day${Math.abs(left) === 1 ? "" : "s"} ago · never converted`,
          urgency: BASE_URGENCY.TRIAL_EXPIRED + left, days: left,
        });
      } else if (left <= HORIZON_DAYS) {
        items.push({
          kind: "TRIAL_ENDING", id: row.tenantId, title: row.tenantName,
          detail: left === 0 ? "Trial ends today" : `Trial ends in ${left} day${left === 1 ? "" : "s"} · ${row.planName}`,
          urgency: BASE_URGENCY.TRIAL_ENDING + left, days: left,
        });
      }
      continue;
    }

    if (row.status === "ACTIVE" && row.currentPeriodEnd) {
      const left = daysUntil(row.currentPeriodEnd, now);
      if (left <= HORIZON_DAYS) {
        items.push({
          kind: "RENEWAL_DUE", id: row.tenantId, title: row.tenantName,
          detail: left < 0 ? `Renewal ${Math.abs(left)} day${Math.abs(left) === 1 ? "" : "s"} overdue` : `Renews in ${left} day${left === 1 ? "" : "s"} · ${row.planName}`,
          urgency: BASE_URGENCY.RENEWAL_DUE + left, days: left,
        });
      }
    }

    // Signed up, never used it. Caught early this is a support call; caught late it is a refund.
    const age = Math.floor((now.getTime() - row.createdAt.getTime()) / DAY);
    if (!row.hasActivity && age >= 3 && row.status !== "CANCELLED") {
      items.push({
        kind: "NEVER_ACTIVATED", id: row.tenantId, title: row.tenantName,
        detail: `Signed up ${age} days ago and has never taken a booking`,
        urgency: BASE_URGENCY.NEVER_ACTIVATED - age, days: -age,
      });
    }
  }

  for (const branch of input.pendingBranches) {
    const waiting = branch.submittedAt ? Math.floor((now.getTime() - branch.submittedAt.getTime()) / DAY) : 0;
    items.push({
      kind: "BRANCH_APPROVAL", id: branch.tenantId, title: branch.tenantName,
      detail: `${branch.branchName} waiting ${waiting} day${waiting === 1 ? "" : "s"} for approval`,
      urgency: BASE_URGENCY.BRANCH_APPROVAL - waiting, days: -waiting,
    });
  }

  /**
   * Limits, turned into a phone call.
   *
   * The old behaviour was an error message at the wall: "Group includes 5 branches and you're using
   * 5." Dead end, and the salon reads it as the software being mean. The same fact surfaced here
   * two weeks earlier is an offer with a price on it. Same limit, opposite outcome - one produces a
   * complaint, the other produces revenue.
   */
  for (const row of input.limits ?? []) {
    const blocked = row.used >= row.limit;
    const offer = row.remedy ? ` · offer ${row.remedy}` : "";
    items.push({
      kind: blocked ? "AT_LIMIT" : "NEAR_LIMIT",
      id: row.tenantId,
      title: row.tenantName,
      detail: blocked
        ? `Blocked: ${row.used} of ${row.limit} ${row.label}${offer}`
        : `${row.percent}% of ${row.label} (${row.used} of ${row.limit})${offer}`,
      // Fuller sorts first within each kind.
      urgency: (blocked ? BASE_URGENCY.AT_LIMIT : BASE_URGENCY.NEAR_LIMIT) - row.percent,
      days: null,
    });
  }

  for (const lead of input.leads) {
    if (!lead.followUpAt) continue;
    const left = daysUntil(lead.followUpAt, now);
    if (left > HORIZON_DAYS) continue;
    items.push({
      kind: "LEAD_FOLLOW_UP", id: lead.id, title: lead.salonName,
      detail: left < 0 ? `Follow-up ${Math.abs(left)} day${Math.abs(left) === 1 ? "" : "s"} overdue · ${lead.contactName}` : `Follow up ${left === 0 ? "today" : `in ${left} days`} · ${lead.contactName}`,
      urgency: BASE_URGENCY.LEAD_FOLLOW_UP + left, days: left,
    });
  }

  return items.sort((left, right) => left.urgency - right.urgency);
}

/** Money at risk right now: what is failing, expiring, or up for renewal in the window. */
export function revenueAtRisk(subscriptions: SubscriptionRow[], monthlyValueOf: (row: SubscriptionRow) => number, now = new Date()) {
  let pastDue = 0;
  let trialEnding = 0;
  let renewing = 0;

  for (const row of subscriptions) {
    if (row.status === "PAST_DUE") pastDue += monthlyValueOf(row);
    else if (row.status === "TRIALING" && row.trialEndsAt && daysUntil(row.trialEndsAt, now) <= HORIZON_DAYS) trialEnding += monthlyValueOf(row);
    else if (row.status === "ACTIVE" && row.currentPeriodEnd && daysUntil(row.currentPeriodEnd, now) <= HORIZON_DAYS) renewing += monthlyValueOf(row);
  }

  return { pastDue, trialEnding, renewing };
}
