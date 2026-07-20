import { addGst, isUnlimited } from "./billing-plans";

/**
 * Plans plus add-ons: what a salon actually gets, and what it actually costs.
 *
 * The old model had fixed plans with hard limits, so a Group salon with 5 branches who had used
 * their 5,000 appointments was told to buy Franchise. That is absurd - they do not want unlimited
 * branches, they want more bookings - and a limit that can only be escaped by a tier change is a
 * reason to leave rather than a reason to spend.
 *
 * Here the plan sets a base and add-ons extend it, so the answer to "we've run out" is an offer
 * with a price on it.
 */

export type PlanLimits = {
  maxBranches: number;
  maxStaff: number;
  maxServices: number;
  maxMonthlyAppointments: number;
};

export type AddOnLine = {
  code: string;
  name: string;
  /** Which limit it extends. Null for metered add-ons like message credits. */
  limitField: keyof PlanLimits | null;
  /** What one unit adds - 500 appointments, 1 branch. */
  unitAmount: number;
  unitPricePaise: number;
  quantity: number;
  isMetered: boolean;
};

/**
 * Base limit plus everything bought on top.
 *
 * Unlimited stays unlimited: adding a pack to a Franchise plan cannot accidentally turn "no
 * ceiling" into "500". That would be a silent downgrade, and the salon would discover it by being
 * blocked mid-shift.
 */
export function effectiveLimits(base: PlanLimits, addOns: AddOnLine[]): PlanLimits {
  const limits: PlanLimits = { ...base };

  for (const addOn of addOns) {
    if (!addOn.limitField || addOn.quantity <= 0) continue;
    const current = limits[addOn.limitField];
    if (isUnlimited(current)) continue;
    limits[addOn.limitField] = current + addOn.unitAmount * addOn.quantity;
  }

  return limits;
}

/** What the add-ons add each month, in paise. */
export function addOnMonthlyPaise(addOns: AddOnLine[]): number {
  return addOns.reduce((sum, addOn) => sum + addOn.unitPricePaise * Math.max(0, addOn.quantity), 0);
}

export type QuoteLine = { label: string; detail: string; monthlyPaise: number };

export type Quote = {
  lines: QuoteLine[];
  /** Before GST. */
  netMonthlyPaise: number;
  taxPaise: number;
  grossMonthlyPaise: number;
  limits: PlanLimits;
};

/**
 * Build a quote a salesperson can read out loud.
 *
 * Every line carries its own arithmetic - "2 × 500 appointments" rather than a bare ₹1,000 - so a
 * salon owner can check the sum themselves. A quote someone cannot verify is a quote they will
 * question later, usually after they have agreed to it.
 */
export function buildQuote(plan: { name: string; monthlyPricePaise: number } & PlanLimits, addOns: AddOnLine[]): Quote {
  const lines: QuoteLine[] = [{
    label: plan.name,
    detail: describeLimits(plan),
    monthlyPaise: plan.monthlyPricePaise,
  }];

  for (const addOn of addOns) {
    if (addOn.quantity <= 0) continue;
    lines.push({
      label: addOn.name,
      detail: `${addOn.quantity} × ${addOn.unitAmount.toLocaleString("en-IN")}${addOn.isMetered ? " credits" : ""}`,
      monthlyPaise: addOn.unitPricePaise * addOn.quantity,
    });
  }

  const netMonthlyPaise = lines.reduce((sum, line) => sum + line.monthlyPaise, 0);
  const { tax, gross } = addGst(netMonthlyPaise);

  return { lines, netMonthlyPaise, taxPaise: tax, grossMonthlyPaise: gross, limits: effectiveLimits(plan, addOns) };
}

const amount = (value: number, noun: string) =>
  isUnlimited(value) ? `unlimited ${noun}` : `${value.toLocaleString("en-IN")} ${noun}`;

export function describeLimits(limits: PlanLimits): string {
  return [
    amount(limits.maxBranches, limits.maxBranches === 1 ? "branch" : "branches"),
    amount(limits.maxStaff, "staff"),
    amount(limits.maxMonthlyAppointments, "bookings/mo"),
  ].join(" · ");
}

/* --------------------------------------------------------------------- nearing a limit */

export type UsageCheck = { field: keyof PlanLimits; used: number; limit: number; percent: number };

/** At or above this, it is worth a sales call before they hit the wall. */
export const NEAR_LIMIT_PERCENT = 80;

/**
 * Which limits a salon is close to.
 *
 * The point is to reach them *before* they are blocked. A salon that hits a ceiling mid-shift is a
 * complaint; the same salon called two weeks earlier is an upsell. Same limit, opposite outcome.
 */
export function nearingLimits(limits: PlanLimits, usage: Partial<Record<keyof PlanLimits, number>>): UsageCheck[] {
  const checks: UsageCheck[] = [];

  for (const [field, limit] of Object.entries(limits) as Array<[keyof PlanLimits, number]>) {
    const used = usage[field];
    if (used === undefined || isUnlimited(limit)) continue;
    const percent = Math.round((used / limit) * 100);
    if (percent >= NEAR_LIMIT_PERCENT) checks.push({ field, used, limit, percent });
  }

  return checks.sort((left, right) => right.percent - left.percent);
}

/** The add-on that fixes a given limit, so a warning can carry its own solution. */
export function remedyFor(field: keyof PlanLimits, addOns: Array<{ code: string; name: string; limitField: string | null; unitAmount: number; unitPricePaise: number }>) {
  return addOns.find((addOn) => addOn.limitField === field) ?? null;
}
