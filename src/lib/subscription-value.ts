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
}): number {
  if (!subscription.plan) return 0;
  if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") return 0;

  if (subscription.billingPeriod === "ANNUAL") {
    return Math.round((subscription.agreedPricePaise ?? subscription.plan.annualPricePaise) / 12);
  }
  return subscription.agreedPricePaise ?? subscription.plan.monthlyPricePaise;
}
