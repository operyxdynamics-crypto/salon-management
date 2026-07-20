/**
 * What a subscription is worth per month, in paise.
 *
 * Shared so the dashboard and the money page can never disagree about MRR. Two screens computing
 * the same number two different ways is how a business ends up arguing with its own dashboard.
 *
 * Annual is divided by twelve so a Group-annual salon and a Salon-monthly one sit in the same
 * total. An agreed price always wins over list - what a salon actually pays is the only number
 * worth reporting.
 *
 * Trialing and cancelled count as zero. They are pipeline and history, not revenue, and counting
 * them would flatter the one number that has to stay honest.
 */
export function monthlyValuePaise(subscription: {
  status: string;
  billingPeriod: string;
  agreedPricePaise: number | null;
  plan: { monthlyPricePaise: number; annualPricePaise: number } | null;
  /**
   * Optional, because most callers select only the plan. Where they are loaded they count: a
   * ₹4,999 salon carrying ₹1,000 of packs is a ₹5,999 customer, and expansion revenue that never
   * reaches MRR is expansion revenue nobody gets credit for.
   */
  addOns?: Array<{ quantity: number; addOn: { unitPricePaise: number } }>;
}): number {
  if (!subscription.plan) return 0;
  if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") return 0;

  // Add-ons are priced per month whatever the base period, so this is not divided by twelve.
  const packs = (subscription.addOns ?? []).reduce(
    (sum, line) => sum + line.addOn.unitPricePaise * Math.max(0, line.quantity), 0);

  if (subscription.billingPeriod === "ANNUAL") {
    return Math.round((subscription.agreedPricePaise ?? subscription.plan.annualPricePaise) / 12) + packs;
  }
  return (subscription.agreedPricePaise ?? subscription.plan.monthlyPricePaise) + packs;
}
