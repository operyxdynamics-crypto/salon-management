/**
 * Subscription pricing and access rules.
 *
 * Two jobs: turn a plan into a number a salon owner can read, and decide what a subscription is
 * still allowed to do. Both are pure, because both are the sort of thing that must not be
 * discovered to be wrong by a customer.
 *
 * Money is handled in **paise** throughout. A rupee is only ever produced for display. Floating
 * point cannot represent 0.1 exactly, and a billing system that drifts by a paisa per invoice is a
 * reconciliation nightmare that surfaces months later.
 */

export type BillingPeriod = "MONTHLY" | "ANNUAL";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";

/** GST on SaaS sold in India. SAC 998314. */
export const GST_RATE_PERCENT = 18;

/**
 * How long a salon keeps working after a payment fails.
 *
 * A bounced mandate is usually a bank problem, not a decision to stop paying, and it will be
 * discovered mid-shift with customers waiting. So: a week of full access with a warning, another
 * week read-only so nothing is lost, and only then suspension.
 */
export const GRACE_FULL_ACCESS_DAYS = 7;
export const GRACE_READ_ONLY_DAYS = 14;

export const rupees = (paise: number) => paise / 100;

/** For display: ₹1,999 - no decimals, because these are always whole rupees. */
export function formatPlanPrice(paise: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(rupees(paise));
}

export function addGst(paise: number, ratePercent = GST_RATE_PERCENT) {
  const tax = Math.round((paise * ratePercent) / 100);
  return { net: paise, tax, gross: paise + tax };
}

export type PlanPricing = {
  monthlyPricePaise: number;
  annualPricePaise: number;
  setupFeePaise: number;
};

/**
 * What a subscription costs per billing cycle, before GST.
 *
 * The setup fee is charged once, on the first cycle only, and waived on annual - the annual
 * commitment already covers the cost of onboarding them.
 */
export function cycleCharge(plan: PlanPricing, period: BillingPeriod, isFirstCycle: boolean) {
  const base = period === "ANNUAL" ? plan.annualPricePaise : plan.monthlyPricePaise;
  const setup = isFirstCycle && period === "MONTHLY" ? plan.setupFeePaise : 0;
  // Build the total explicitly rather than spreading addGst over it. A spread was silently
  // overwriting `net` here - it produced the right figure by luck, which is the worst kind of
  // correct in code that decides what to charge someone.
  const { tax, gross } = addGst(base + setup);
  return { base, setup, net: base + setup, tax, gross };
}

/**
 * What the annual price saves, as a percentage. Rounded down so the marketing claim is never
 * larger than the truth.
 */
export function annualSavingPercent(plan: PlanPricing): number {
  const yearAtMonthly = plan.monthlyPricePaise * 12;
  if (yearAtMonthly <= 0 || plan.annualPricePaise <= 0) return 0;
  return Math.floor(((yearAtMonthly - plan.annualPricePaise) / yearAtMonthly) * 100);
}

/** The monthly-equivalent of an annual plan, for the "₹1,599/month billed annually" line. */
export function annualPerMonthPaise(plan: PlanPricing): number {
  return Math.round(plan.annualPricePaise / 12);
}

/* ------------------------------------------------------------------------------ access */

export type AccessLevel = "FULL" | "READ_ONLY" | "BLOCKED";

export type SubscriptionState = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
};

export type AccessDecision = {
  level: AccessLevel;
  /** Something to show the owner. Null when everything is fine and silence is correct. */
  message: string | null;
  /** True when the message deserves a banner rather than a quiet note. */
  urgent: boolean;
  /** Days left before the next thing happens, when that is knowable. */
  daysRemaining: number | null;
};

const DAY = 86_400_000;
const daysBetween = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY);

/**
 * What a salon may do right now.
 *
 * The guiding rule is that **billing must never destroy work**. Even a suspended salon keeps
 * read-only access to its own invoices and customers: that data is theirs, some of it is a legal
 * record they are required to retain, and holding it hostage over an unpaid invoice is both wrong
 * and, for GST records, arguably unlawful. BLOCKED here means "cannot create new work", never
 * "cannot see your own history".
 */
export function accessFor(subscription: SubscriptionState, now = new Date()): AccessDecision {
  const { status, trialEndsAt, pastDueSince } = subscription;

  if (status === "CANCELLED") {
    return { level: "READ_ONLY", message: "Your subscription has ended. Your records stay available to read and export.", urgent: true, daysRemaining: null };
  }

  if (status === "SUSPENDED") {
    return { level: "READ_ONLY", message: "This salon is suspended. Settle the outstanding invoice to start billing again.", urgent: true, daysRemaining: null };
  }

  if (status === "TRIALING") {
    if (!trialEndsAt) return { level: "FULL", message: null, urgent: false, daysRemaining: null };
    const left = daysBetween(now, trialEndsAt);
    if (left <= 0) {
      return { level: "READ_ONLY", message: "Your trial has ended. Choose a plan to carry on billing.", urgent: true, daysRemaining: 0 };
    }
    return {
      level: "FULL",
      // Silence until it matters. A countdown from day one is nagging; from day eleven it is useful.
      message: left <= 3 ? `${left} day${left === 1 ? "" : "s"} left in your trial.` : null,
      urgent: left <= 3,
      daysRemaining: left,
    };
  }

  if (status === "PAST_DUE" && pastDueSince) {
    const elapsed = Math.floor((now.getTime() - pastDueSince.getTime()) / DAY);
    if (elapsed < GRACE_FULL_ACCESS_DAYS) {
      return {
        level: "FULL",
        message: "We couldn't take your payment. Please update it to avoid interruption.",
        urgent: true,
        daysRemaining: GRACE_FULL_ACCESS_DAYS - elapsed,
      };
    }
    if (elapsed < GRACE_READ_ONLY_DAYS) {
      return {
        level: "READ_ONLY",
        message: "Billing is paused until payment is settled. You can still view and export everything.",
        urgent: true,
        daysRemaining: GRACE_READ_ONLY_DAYS - elapsed,
      };
    }
    return { level: "READ_ONLY", message: "This salon is suspended for non-payment.", urgent: true, daysRemaining: 0 };
  }

  return { level: "FULL", message: null, urgent: false, daysRemaining: null };
}

/* ------------------------------------------------------------------------------ limits */

export type PlanLimits = {
  maxBranches: number;
  maxStaff: number;
  maxServices: number;
  maxMonthlyAppointments: number;
};

export type LimitCheck = { allowed: boolean; used: number; limit: number; message: string | null };

/** Treat any non-positive limit as unlimited, so "0" in a Franchise plan means no ceiling. */
export const isUnlimited = (limit: number) => limit <= 0;

/**
 * Check one capacity limit before creating something.
 *
 * The message names the plan and what to do about it. "Limit reached" tells an owner they are
 * stuck; "Salon covers 15 staff - upgrade to Group for 50" tells them the way out, which is the
 * only version that ever sells an upgrade.
 */
export function checkLimit(what: "branches" | "staff" | "services", used: number, limit: number, planName: string, nextPlanName?: string): LimitCheck {
  if (isUnlimited(limit) || used < limit) return { allowed: true, used, limit, message: null };
  const noun = what === "branches" ? "branch" : what === "staff" ? "team member" : "service";
  const upgrade = nextPlanName ? ` Upgrade to ${nextPlanName} for more.` : " Contact us to raise the limit.";
  return {
    allowed: false,
    used,
    limit,
    message: `${planName} includes ${limit} ${noun}${limit === 1 ? "" : "s"}, and you're using ${used}.${upgrade}`,
  };
}
