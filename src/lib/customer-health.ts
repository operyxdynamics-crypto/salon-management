/**
 * Is this salon in trouble?
 *
 * Every churn is preceded by a usage decline that was visible and unwatched. By the time a salon
 * cancels they left weeks earlier; the cancellation is paperwork. This turns billing activity into
 * an early warning, so a slipping salon is a phone call this week rather than a lost customer next
 * month.
 *
 * Deliberately **not a score out of 100.** A score presents a guess as a fact, and acting on a
 * confident-looking number means ringing customers who are perfectly fine and annoying them. What
 * comes out of here is a band plus the evidence for it - "bills down from 40 to 9" - so a human
 * decides, holding the same facts we did.
 */

export type HealthBand = "HEALTHY" | "WATCH" | "AT_RISK" | "DORMANT" | "NEW";

export type HealthInput = {
  /** Invoices raised in the last 7 days. */
  billsThisWeek: number;
  /** Invoices raised in the 7 days before that - the comparison that reveals a slide. */
  billsLastWeek: number;
  /** Days since the most recent invoice. Null when they have never billed. */
  daysSinceLastBill: number | null;
  /** How long they have been a customer, so a new salon is not judged by an old salon's yardstick. */
  ageDays: number;
};

export type Health = {
  band: HealthBand;
  /** Plain-language facts, not a verdict. What a human needs to decide whether to call. */
  evidence: string[];
  /** Lower sorts first, so the worst appear at the top of a list. */
  rank: number;
};

const BAND_RANK: Record<HealthBand, number> = { DORMANT: 0, AT_RISK: 1, WATCH: 2, NEW: 3, HEALTHY: 4 };

/** Below this, week-on-week percentages are noise rather than signal. */
const MIN_MEANINGFUL_BILLS = 5;

export function assessHealth(input: HealthInput): Health {
  const { billsThisWeek, billsLastWeek, daysSinceLastBill, ageDays } = input;
  const evidence: string[] = [];

  // A salon in its first fortnight is still setting up. Judging it against a settled salon's
  // volume would flag every new customer as failing on the day they join.
  if (ageDays < 14) {
    return {
      band: "NEW",
      evidence: [daysSinceLastBill === null ? "Not billed yet - still setting up" : `${billsThisWeek} bill${billsThisWeek === 1 ? "" : "s"} in the first two weeks`],
      rank: BAND_RANK.NEW,
    };
  }

  // Stopped entirely. This is the one that becomes a cancellation.
  if (daysSinceLastBill === null || daysSinceLastBill >= 14) {
    evidence.push(daysSinceLastBill === null ? "Has never raised a bill" : `No bills for ${daysSinceLastBill} days`);
    return { band: "DORMANT", evidence, rank: BAND_RANK.DORMANT };
  }

  const drop = billsLastWeek > 0 ? Math.round(((billsLastWeek - billsThisWeek) / billsLastWeek) * 100) : 0;
  const meaningful = billsLastWeek >= MIN_MEANINGFUL_BILLS;

  if (meaningful && drop >= 50) {
    evidence.push(`Bills down from ${billsLastWeek} to ${billsThisWeek} this week`);
    return { band: "AT_RISK", evidence, rank: BAND_RANK.AT_RISK };
  }

  if (daysSinceLastBill >= 7) {
    evidence.push(`Last bill ${daysSinceLastBill} days ago`);
    return { band: "AT_RISK", evidence, rank: BAND_RANK.AT_RISK };
  }

  if (meaningful && drop >= 25) {
    evidence.push(`Bills down ${drop}% on last week (${billsLastWeek} → ${billsThisWeek})`);
    return { band: "WATCH", evidence, rank: BAND_RANK.WATCH };
  }

  evidence.push(`${billsThisWeek} bill${billsThisWeek === 1 ? "" : "s"} this week`);
  if (billsThisWeek > billsLastWeek && billsLastWeek > 0) evidence.push(`Up from ${billsLastWeek}`);
  return { band: "HEALTHY", evidence, rank: BAND_RANK.HEALTHY };
}

/* ------------------------------------------------------------------------------ churn */

export type ChurnInput = {
  /** Paying customers at the start of the period. */
  startingCustomers: number;
  /** How many cancelled during it. */
  cancelled: number;
  /** Monthly revenue those cancellations took with them, in rupees. */
  cancelledMrr: number;
  /** Monthly revenue at the start, in rupees. */
  startingMrr: number;
  /** Monthly revenue won during the period, in rupees. */
  newMrr: number;
};

export type Churn = {
  /** Percentage of customers lost. */
  customerChurnPercent: number;
  /** Percentage of revenue lost - the number that actually matters. */
  revenueChurnPercent: number;
  /** New minus lost. Negative means the business shrank even if it signed customers. */
  netMrrChange: number;
  /** True when new revenue more than replaced what was lost. */
  growing: boolean;
};

const percent = (part: number, whole: number) => whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10;

/**
 * Churn, both ways.
 *
 * Customer churn and revenue churn diverge in the way that matters most: losing one Franchise
 * customer and winning two Salon ones looks like growth by customer count and is a serious loss by
 * revenue. Reporting only the first is how a company congratulates itself while shrinking.
 */
export function computeChurn(input: ChurnInput): Churn {
  const netMrrChange = Math.round((input.newMrr - input.cancelledMrr) * 100) / 100;
  return {
    customerChurnPercent: percent(input.cancelled, input.startingCustomers),
    revenueChurnPercent: percent(input.cancelledMrr, input.startingMrr),
    netMrrChange,
    growing: netMrrChange > 0,
  };
}
