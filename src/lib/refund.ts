/**
 * Refund tender allocation.
 *
 * A refund must be returned to the tenders the customer actually paid with.
 * Restricted tenders (wallet, gift card, loyalty, package) are instruments that
 * hold value - money refunded against them must go back onto the instrument, not
 * out of the cash drawer. Cash-equivalent tenders (cash, card, UPI) are settled
 * as real money and collapse into a single operator-chosen refund method.
 *
 * These functions are pure so the arithmetic can be proven without a database.
 */

export type RefundTenderMethod = "CASH" | "CARD" | "UPI" | "GIFT_CARD" | "LOYALTY" | "WALLET" | "PACKAGE";
export type CashEquivalentMethod = "CASH" | "CARD" | "UPI";

export const CASH_EQUIVALENT_METHODS: readonly CashEquivalentMethod[] = ["CASH", "CARD", "UPI"] as const;

export type InvoiceTender = {
  id: string;
  method: RefundTenderMethod;
  amount: number;
  reference?: string | null;
};

export type RefundAllocation = {
  /** Original PaymentRecord id this allocation reverses. Null for the pooled cash-equivalent row. */
  sourcePaymentId: string | null;
  method: RefundTenderMethod;
  reference: string | null;
  amount: number;
  /** True when the value returns to an instrument (wallet/gift card/loyalty) rather than the drawer. */
  restricted: boolean;
};

export class RefundAllocationError extends Error {
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "RefundAllocationError";
  }
}

const EPSILON = 0.005;

export function money(value: number) {
  return Number(value.toFixed(2));
}

export function isCashEquivalent(method: RefundTenderMethod): method is CashEquivalentMethod {
  return (CASH_EQUIVALENT_METHODS as readonly string[]).includes(method);
}

/**
 * Identity of a tender for refund-history purposes. Two gift cards on one invoice
 * are distinct tenders; two cash rows are not.
 */
export function tenderKey(tender: { method: RefundTenderMethod; reference?: string | null }) {
  return isCashEquivalent(tender.method) ? "CASH_EQUIVALENT" : `${tender.method}:${tender.reference ?? ""}`;
}

/**
 * How much of each tender has already been returned by earlier refunds against
 * this invoice. Prior refund invoices carry their own PaymentRecord rows; we group
 * them by tender identity so a second partial refund cannot over-restore.
 */
export function tenderRefundState(originalTenders: InvoiceTender[], priorRefundTenders: Array<{ method: RefundTenderMethod; amount: number; reference?: string | null }>) {
  const refunded = new Map<string, number>();
  for (const tender of priorRefundTenders) {
    const key = tenderKey(tender);
    refunded.set(key, money((refunded.get(key) ?? 0) + tender.amount));
  }
  const paid = new Map<string, number>();
  for (const tender of originalTenders) {
    const key = tenderKey(tender);
    paid.set(key, money((paid.get(key) ?? 0) + tender.amount));
  }
  const state = new Map<string, { paid: number; refunded: number; remaining: number }>();
  for (const [key, paidAmount] of paid) {
    const refundedAmount = Math.min(paidAmount, refunded.get(key) ?? 0);
    state.set(key, { paid: paidAmount, refunded: refundedAmount, remaining: money(paidAmount - refundedAmount) });
  }
  return state;
}

/**
 * Split a refund total across the invoice's tenders.
 *
 * Allocation is proportional to what remains un-refunded on each tender, so a
 * customer who paid half by wallet gets half of any refund back on the wallet.
 * Restricted tenders are capped at their remaining balance. Everything else is
 * settled as one cash-equivalent row in the operator's chosen method.
 *
 * Throws if the refund exceeds what remains across all tenders.
 */
export function allocateRefundTenders({
  refundTotal,
  tenders,
  priorRefundTenders = [],
  cashMethod = "CASH",
  cashReference = null,
}: {
  refundTotal: number;
  tenders: InvoiceTender[];
  priorRefundTenders?: Array<{ method: RefundTenderMethod; amount: number; reference?: string | null }>;
  cashMethod?: CashEquivalentMethod;
  cashReference?: string | null;
}): RefundAllocation[] {
  const target = money(refundTotal);
  if (target <= 0) throw new RefundAllocationError("Refund total must be greater than zero", { refundTotal });

  const state = tenderRefundState(tenders, priorRefundTenders);
  const totalRemaining = money(Array.from(state.values()).reduce((sum, entry) => sum + entry.remaining, 0));
  if (target > totalRemaining + EPSILON) {
    throw new RefundAllocationError("Refund exceeds the amount still available on the original payments", {
      refundTotal: target,
      availableToRefund: totalRemaining,
    });
  }

  const restrictedTenders = tenders.filter((tender) => !isCashEquivalent(tender.method));
  const cashRemaining = state.get("CASH_EQUIVALENT")?.remaining ?? 0;

  // Proportional share of the refund for each restricted tender, capped at what remains on it.
  const allocations: RefundAllocation[] = [];
  const restrictedRemainingByKey = new Map<string, number>();
  for (const tender of restrictedTenders) {
    const key = tenderKey(tender);
    if (!restrictedRemainingByKey.has(key)) {
      restrictedRemainingByKey.set(key, state.get(key)?.remaining ?? 0);
    }
  }

  let allocatedToRestricted = 0;
  for (const tender of restrictedTenders) {
    const key = tenderKey(tender);
    const remaining = restrictedRemainingByKey.get(key) ?? 0;
    if (remaining <= EPSILON) continue;
    const share = totalRemaining > 0 ? money(target * (remaining / totalRemaining)) : 0;
    const amount = money(Math.min(share, remaining));
    if (amount <= EPSILON) continue;
    restrictedRemainingByKey.set(key, money(remaining - amount));
    allocatedToRestricted = money(allocatedToRestricted + amount);
    allocations.push({
      sourcePaymentId: tender.id,
      method: tender.method,
      reference: tender.reference ?? null,
      amount,
      restricted: true,
    });
  }

  // Whatever is left is real money out of the drawer.
  let cashPortion = money(target - allocatedToRestricted);

  // Rounding drift: proportional shares can land a paisa or two off. Absorb the
  // difference in the cash row when one exists, otherwise on the largest restricted row.
  if (cashPortion < 0) {
    const largest = allocations.reduce<RefundAllocation | null>((best, item) => (!best || item.amount > best.amount ? item : best), null);
    if (largest) {
      largest.amount = money(largest.amount + cashPortion);
      allocatedToRestricted = money(allocatedToRestricted + cashPortion);
    }
    cashPortion = 0;
  }

  if (cashPortion > cashRemaining + EPSILON) {
    throw new RefundAllocationError("Refund exceeds the cash, card, and UPI amount still available on this invoice", {
      cashPortion,
      cashRemaining,
    });
  }

  if (cashPortion > EPSILON) {
    allocations.push({
      sourcePaymentId: null,
      method: cashMethod,
      reference: cashReference,
      amount: cashPortion,
      restricted: false,
    });
  }

  const allocatedTotal = money(allocations.reduce((sum, item) => sum + item.amount, 0));
  if (Math.abs(allocatedTotal - target) > 0.01) {
    throw new RefundAllocationError("Refund allocation did not balance against the refund total", {
      refundTotal: target,
      allocatedTotal,
    });
  }

  return allocations.filter((item) => item.amount > EPSILON);
}

/**
 * Reverse a whole-number quantity (loyalty points) in proportion to a refund.
 *
 * The previous implementation used Math.max(1, ...), which returned at least one
 * point even for a negligible refund - a slow leak against the salon. A zero share
 * now correctly reverses zero.
 */
export function proportionalPoints(originalPoints: number, ratio: number) {
  if (!Number.isFinite(originalPoints) || !Number.isFinite(ratio)) return 0;
  const clamped = Math.min(1, Math.max(0, ratio));
  const magnitude = Math.round(Math.abs(originalPoints) * clamped);
  if (magnitude <= 0) return 0;
  return originalPoints < 0 ? -magnitude : magnitude;
}

/**
 * Points required to fund a loyalty refund of `amount`, given the reward rule's
 * conversion rate. Mirrors the redemption maths used at checkout.
 */
export function loyaltyPointsForAmount(amount: number, amountPerPoint: number) {
  const rate = amountPerPoint > 0 ? amountPerPoint : 1;
  return Math.round(amount / rate);
}

/** Per-tender view for the invoice detail API and the refund confirmation dialog. */
export function tenderSummary(tenders: InvoiceTender[], priorRefundTenders: Array<{ method: RefundTenderMethod; amount: number; reference?: string | null }>) {
  const state = tenderRefundState(tenders, priorRefundTenders);
  const seen = new Set<string>();
  const summary: Array<{ key: string; method: RefundTenderMethod; reference: string | null; paid: number; refunded: number; remaining: number; restricted: boolean }> = [];
  for (const tender of tenders) {
    const key = tenderKey(tender);
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = state.get(key);
    if (!entry) continue;
    summary.push({
      key,
      method: isCashEquivalent(tender.method) ? tender.method : tender.method,
      reference: tender.reference ?? null,
      paid: entry.paid,
      refunded: entry.refunded,
      remaining: entry.remaining,
      restricted: !isCashEquivalent(tender.method),
    });
  }
  return summary;
}
