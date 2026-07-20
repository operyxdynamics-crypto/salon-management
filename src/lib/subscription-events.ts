import { monthlyValuePaise } from "./subscription-value";

/**
 * Classifying a subscription change.
 *
 * Pure, because the answer decides what the company later believes about its own growth. If an
 * upgrade is ever mis-recorded as a downgrade, net revenue retention is wrong forever and nobody
 * finds out - the number simply looks slightly worse than reality and gets acted on anyway.
 */

export type SubscriptionEventKind =
  | "CREATED" | "TRIAL_STARTED" | "TRIAL_EXTENDED" | "CONVERTED"
  | "UPGRADED" | "DOWNGRADED" | "RENEWED" | "PAYMENT_FAILED"
  | "RECOVERED" | "CANCELLED" | "REACTIVATED" | "PRICE_CHANGED";

export type SubscriptionSnapshot = {
  status: string;
  billingPeriod: string;
  agreedPricePaise: number | null;
  planCode: string;
  plan: { monthlyPricePaise: number; annualPricePaise: number } | null;
};

export type ClassifiedEvent = {
  kind: SubscriptionEventKind;
  fromValuePaise: number | null;
  toValuePaise: number | null;
  fromPlanCode: string | null;
  toPlanCode: string | null;
};

/**
 * What kind of change is this?
 *
 * Order matters. Status transitions are checked before value changes because they describe what
 * *happened* - a salon converting from trial to paid is a CONVERTED event, not an UPGRADE, even
 * though its monthly value went from zero to ₹1,999. Getting that wrong would count every
 * conversion as expansion revenue and make NRR look spectacular and fictional.
 */
export function classifyChange(before: SubscriptionSnapshot | null, after: SubscriptionSnapshot): ClassifiedEvent {
  // A trialing subscription is worth nothing yet, so value it at what it *would* be. Otherwise a
  // trial extension looks like a price change from zero to zero.
  const valueOf = (snapshot: SubscriptionSnapshot) =>
    monthlyValuePaise({ ...snapshot, status: "ACTIVE" });

  const toValue = valueOf(after);
  const fromValue = before ? valueOf(before) : null;
  const base = {
    fromValuePaise: fromValue,
    toValuePaise: toValue,
    fromPlanCode: before?.planCode ?? null,
    toPlanCode: after.planCode,
  };

  if (!before) {
    return { ...base, kind: after.status === "TRIALING" ? "TRIAL_STARTED" : "CREATED" };
  }

  // --- status transitions first: they describe the event better than the money does ---
  if (before.status !== after.status) {
    if (after.status === "CANCELLED") return { ...base, kind: "CANCELLED" };
    if (after.status === "PAST_DUE") return { ...base, kind: "PAYMENT_FAILED" };
    if (before.status === "PAST_DUE" && after.status === "ACTIVE") return { ...base, kind: "RECOVERED" };
    if (before.status === "TRIALING" && after.status === "ACTIVE") return { ...base, kind: "CONVERTED" };
    if (before.status === "CANCELLED" || before.status === "SUSPENDED") {
      if (after.status === "ACTIVE" || after.status === "TRIALING") return { ...base, kind: "REACTIVATED" };
    }
    if (after.status === "TRIALING") return { ...base, kind: "TRIAL_STARTED" };
  }

  // --- then movement in money ---
  if (fromValue !== null && toValue !== fromValue) {
    if (before.planCode !== after.planCode) {
      return { ...base, kind: toValue > fromValue ? "UPGRADED" : "DOWNGRADED" };
    }
    // Same plan, different money: a discount, or a switch between monthly and annual.
    return { ...base, kind: "PRICE_CHANGED" };
  }

  // Same plan, same money, still trialing - the trial was pushed out.
  if (after.status === "TRIALING") return { ...base, kind: "TRIAL_EXTENDED" };

  return { ...base, kind: "RENEWED" };
}

/* ------------------------------------------------------------------------- retention */

export type RetentionInput = {
  /** Monthly recurring revenue at the start of the period, in rupees. */
  startingMrr: number;
  /** Revenue gained from existing customers upgrading, in rupees. */
  expansion: number;
  /** Revenue lost to existing customers downgrading, in rupees. */
  contraction: number;
  /** Revenue lost to customers leaving entirely, in rupees. */
  churned: number;
};

/**
 * Net revenue retention.
 *
 * The CEO's number. Above 100% means existing customers grow faster than they leave - the company
 * survives a bad sales month, because the base itself is growing. Below 100% means the bucket
 * leaks and every new customer is replacing one already lost.
 *
 * New customers are deliberately excluded. NRR measures whether the customers you already have are
 * worth more over time; including new sales would hide a retention problem behind a good month.
 */
export function netRevenueRetention(input: RetentionInput): number {
  if (input.startingMrr <= 0) return 0;
  const retained = input.startingMrr + input.expansion - input.contraction - input.churned;
  return Math.round((retained / input.startingMrr) * 1000) / 10;
}

/** Gross retention ignores expansion: what survives without upsell papering over losses. */
export function grossRevenueRetention(input: RetentionInput): number {
  if (input.startingMrr <= 0) return 0;
  const retained = input.startingMrr - input.contraction - input.churned;
  return Math.round((retained / input.startingMrr) * 1000) / 10;
}
