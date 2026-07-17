import { describe, expect, it } from "vitest";
import {
  allocateRefundTenders,
  loyaltyPointsForAmount,
  proportionalPoints,
  RefundAllocationError,
  tenderRefundState,
  tenderSummary,
  type InvoiceTender,
} from "./refund";

const cashOnly: InvoiceTender[] = [{ id: "pay_cash", method: "CASH", amount: 1000 }];

const walletAndCash: InvoiceTender[] = [
  { id: "pay_wallet", method: "WALLET", amount: 500 },
  { id: "pay_cash", method: "CASH", amount: 500 },
];

const mixedTender: InvoiceTender[] = [
  { id: "pay_gift", method: "GIFT_CARD", amount: 200, reference: "GC-8842" },
  { id: "pay_loyalty", method: "LOYALTY", amount: 100 },
  { id: "pay_upi", method: "UPI", amount: 700 },
];

function totalOf(allocations: Array<{ amount: number }>) {
  return Number(allocations.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
}

describe("allocateRefundTenders", () => {
  it("refunds a cash-only invoice entirely in the operator's chosen method", () => {
    const allocations = allocateRefundTenders({ refundTotal: 1000, tenders: cashOnly, cashMethod: "UPI" });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ method: "UPI", amount: 1000, restricted: false });
  });

  it("does not pay out the wallet portion in cash (the double-refund bug)", () => {
    const allocations = allocateRefundTenders({ refundTotal: 1000, tenders: walletAndCash, cashMethod: "CASH" });

    // The old route created a single CASH row for the full 1000 *and* credited 500
    // back to the wallet - refunding 1500 against a 1000 invoice.
    expect(totalOf(allocations)).toBe(1000);

    const wallet = allocations.find((item) => item.method === "WALLET");
    const cash = allocations.find((item) => item.method === "CASH");
    expect(wallet?.amount).toBe(500);
    expect(cash?.amount).toBe(500);
  });

  it("splits a partial refund proportionally across tenders", () => {
    const allocations = allocateRefundTenders({ refundTotal: 400, tenders: walletAndCash, cashMethod: "CASH" });
    expect(totalOf(allocations)).toBe(400);
    expect(allocations.find((item) => item.method === "WALLET")?.amount).toBe(200);
    expect(allocations.find((item) => item.method === "CASH")?.amount).toBe(200);
  });

  it("returns gift card and loyalty value to their instruments, remainder to the drawer", () => {
    const allocations = allocateRefundTenders({ refundTotal: 1000, tenders: mixedTender, cashMethod: "CARD" });
    expect(totalOf(allocations)).toBe(1000);

    const gift = allocations.find((item) => item.method === "GIFT_CARD");
    expect(gift).toMatchObject({ amount: 200, reference: "GC-8842", restricted: true });
    expect(allocations.find((item) => item.method === "LOYALTY")?.amount).toBe(100);

    const card = allocations.find((item) => item.method === "CARD");
    expect(card).toMatchObject({ amount: 700, restricted: false });
  });

  it("keeps two gift cards on one invoice as separate tenders", () => {
    const twoCards: InvoiceTender[] = [
      { id: "p1", method: "GIFT_CARD", amount: 300, reference: "GC-1" },
      { id: "p2", method: "GIFT_CARD", amount: 100, reference: "GC-2" },
    ];
    const allocations = allocateRefundTenders({ refundTotal: 400, tenders: twoCards });
    expect(allocations.find((item) => item.reference === "GC-1")?.amount).toBe(300);
    expect(allocations.find((item) => item.reference === "GC-2")?.amount).toBe(100);
  });

  it("respects value already returned by an earlier partial refund", () => {
    const priorRefundTenders = [
      { method: "WALLET" as const, amount: 200 },
      { method: "CASH" as const, amount: 200 },
    ];
    const allocations = allocateRefundTenders({
      refundTotal: 600,
      tenders: walletAndCash,
      priorRefundTenders,
      cashMethod: "CASH",
    });

    // 300 remains on the wallet and 300 in cash. The second refund exhausts both.
    expect(totalOf(allocations)).toBe(600);
    expect(allocations.find((item) => item.method === "WALLET")?.amount).toBe(300);
    expect(allocations.find((item) => item.method === "CASH")?.amount).toBe(300);
  });

  it("refuses to refund more than the invoice still has available", () => {
    expect(() => allocateRefundTenders({
      refundTotal: 900,
      tenders: walletAndCash,
      priorRefundTenders: [{ method: "WALLET", amount: 500 }],
    })).toThrow(RefundAllocationError);
  });

  it("refuses a zero or negative refund", () => {
    expect(() => allocateRefundTenders({ refundTotal: 0, tenders: cashOnly })).toThrow(RefundAllocationError);
    expect(() => allocateRefundTenders({ refundTotal: -50, tenders: cashOnly })).toThrow(RefundAllocationError);
  });

  it("balances to the exact refund total when proportional shares do not divide cleanly", () => {
    const awkward: InvoiceTender[] = [
      { id: "w", method: "WALLET", amount: 333.33 },
      { id: "c", method: "CASH", amount: 666.67 },
    ];
    const allocations = allocateRefundTenders({ refundTotal: 100.01, tenders: awkward });
    expect(totalOf(allocations)).toBe(100.01);
  });

  it("never allocates more to a restricted tender than remains on it", () => {
    const allocations = allocateRefundTenders({
      refundTotal: 500,
      tenders: walletAndCash,
      priorRefundTenders: [{ method: "WALLET", amount: 400 }],
      cashMethod: "CASH",
    });
    const wallet = allocations.find((item) => item.method === "WALLET");
    expect(wallet?.amount ?? 0).toBeLessThanOrEqual(100);
    expect(totalOf(allocations)).toBe(500);
  });
});

describe("tenderRefundState", () => {
  it("reports paid, refunded, and remaining per tender", () => {
    const state = tenderRefundState(walletAndCash, [{ method: "CASH", amount: 150 }]);
    expect(state.get("WALLET:")).toMatchObject({ paid: 500, refunded: 0, remaining: 500 });
    expect(state.get("CASH_EQUIVALENT")).toMatchObject({ paid: 500, refunded: 150, remaining: 350 });
  });

  it("pools cash, card, and UPI into a single settleable bucket", () => {
    const state = tenderRefundState(
      [{ id: "a", method: "CASH", amount: 100 }, { id: "b", method: "UPI", amount: 400 }],
      [],
    );
    expect(state.get("CASH_EQUIVALENT")?.paid).toBe(500);
  });

  it("cannot report more refunded than was paid", () => {
    const state = tenderRefundState(cashOnly, [{ method: "CASH", amount: 5000 }]);
    expect(state.get("CASH_EQUIVALENT")).toMatchObject({ refunded: 1000, remaining: 0 });
  });
});

describe("tenderSummary", () => {
  it("flags which tenders return to an instrument", () => {
    const summary = tenderSummary(mixedTender, []);
    expect(summary.find((item) => item.method === "GIFT_CARD")?.restricted).toBe(true);
    expect(summary.find((item) => item.method === "UPI")?.restricted).toBe(false);
  });
});

describe("proportionalPoints", () => {
  it("does not leak a point on a negligible refund", () => {
    // The old code used Math.max(1, ...) and returned 1 point for any non-zero
    // ratio, however small. A share that rounds to nothing must reverse nothing.
    expect(proportionalPoints(5000, 0.00001)).toBe(0);
    expect(proportionalPoints(100, 0.001)).toBe(0);
  });

  it("still rounds a genuine half-point up", () => {
    expect(proportionalPoints(5000, 0.0001)).toBe(1);
  });

  it("reverses the full amount on a full refund", () => {
    expect(proportionalPoints(240, 1)).toBe(240);
  });

  it("preserves sign so redeemed points restore and earned points reverse", () => {
    expect(proportionalPoints(-120, 0.5)).toBe(-60);
    expect(proportionalPoints(120, 0.5)).toBe(60);
  });

  it("clamps a ratio above one", () => {
    expect(proportionalPoints(100, 3)).toBe(100);
  });
});

describe("loyaltyPointsForAmount", () => {
  it("converts a refund amount back into points at the rule's rate", () => {
    expect(loyaltyPointsForAmount(100, 2)).toBe(50);
  });

  it("falls back to a 1:1 rate when the rule is misconfigured", () => {
    expect(loyaltyPointsForAmount(100, 0)).toBe(100);
  });
});
