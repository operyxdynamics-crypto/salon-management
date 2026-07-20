import type { AddOnLine, PlanLimits } from "./packages";

/**
 * The definitions Pipeline, Trials and Customers must agree on.
 *
 * They live here rather than in each page because the bug this whole rebuild exists to fix was two
 * screens disagreeing about what a customer is. If "paying" is spelled out in three files, it will
 * eventually mean three things.
 */

/** Past the trial: they have paid, are late, are suspended, or have left. All customers. */
export const PAYING_STATUSES = ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const;

/** Using it for free. Never a customer, never in MRR. */
export const TRIAL_STATUSES = ["TRIALING"] as const;

/** First moment of the current calendar month, for "bookings this month" style counts. */
export function monthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

type StoredAddOn = {
  quantity: number;
  addOn: { code: string; name: string; limitField: string | null; unitAmount: number; unitPricePaise: number; isMetered: boolean };
};

/**
 * Turn stored add-ons into the shape the pricing maths wants.
 *
 * The price is read from the add-on record every time, never from the subscription. That is what
 * lets Operyx change a pack price next quarter without silently re-pricing salons who bought it
 * last quarter - the same rule that already protects base plans.
 */
export function toAddOnLines(lines: StoredAddOn[]): AddOnLine[] {
  return lines.map((line) => ({
    code: line.addOn.code,
    name: line.addOn.name,
    limitField: (line.addOn.limitField as keyof PlanLimits | null) ?? null,
    unitAmount: line.addOn.unitAmount,
    unitPricePaise: line.addOn.unitPricePaise,
    quantity: line.quantity,
    isMetered: line.addOn.isMetered,
  }));
}

/** Plain English for a limit field, so a warning reads like a sentence. */
export const LIMIT_LABEL: Record<string, string> = {
  maxBranches: "branches used",
  maxStaff: "staff seats used",
  maxServices: "services used",
  maxMonthlyAppointments: "bookings used",
};
