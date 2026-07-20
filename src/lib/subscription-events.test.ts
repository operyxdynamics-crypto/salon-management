import { describe, expect, it } from "vitest";
import { classifyChange, grossRevenueRetention, netRevenueRetention, type SubscriptionSnapshot } from "./subscription-events";

const SALON = { monthlyPricePaise: 199_900, annualPricePaise: 1_918_800 };
const GROUP = { monthlyPricePaise: 499_900, annualPricePaise: 4_798_800 };

const snap = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  status: "ACTIVE", billingPeriod: "MONTHLY", agreedPricePaise: null, planCode: "salon", plan: SALON, ...over,
});

describe("classifyChange", () => {
  it("records a new trial", () => {
    const event = classifyChange(null, snap({ status: "TRIALING" }));
    expect(event.kind).toBe("TRIAL_STARTED");
    // Valued at what it would be worth, so conversion later shows the right movement.
    expect(event.toValuePaise).toBe(199_900);
  });

  it("records a subscription created already paying", () => {
    expect(classifyChange(null, snap()).kind).toBe("CREATED");
  });

  /**
   * The one that would quietly ruin NRR. A trial converting is worth 0 → ₹1,999, which looks
   * exactly like expansion. Counting conversions as expansion makes retention look spectacular
   * and fictional.
   */
  it("calls a trial converting CONVERTED, not an upgrade", () => {
    expect(classifyChange(snap({ status: "TRIALING" }), snap({ status: "ACTIVE" })).kind).toBe("CONVERTED");
  });

  it("records an upgrade with both values", () => {
    const event = classifyChange(snap(), snap({ planCode: "group", plan: GROUP }));
    expect(event.kind).toBe("UPGRADED");
    expect(event.fromValuePaise).toBe(199_900);
    expect(event.toValuePaise).toBe(499_900);
    expect(event.toPlanCode).toBe("group");
  });

  it("records a downgrade", () => {
    expect(classifyChange(snap({ planCode: "group", plan: GROUP }), snap()).kind).toBe("DOWNGRADED");
  });

  it("records a failed payment and a recovery", () => {
    expect(classifyChange(snap(), snap({ status: "PAST_DUE" })).kind).toBe("PAYMENT_FAILED");
    expect(classifyChange(snap({ status: "PAST_DUE" }), snap()).kind).toBe("RECOVERED");
  });

  it("records a cancellation and a win-back", () => {
    expect(classifyChange(snap(), snap({ status: "CANCELLED" })).kind).toBe("CANCELLED");
    expect(classifyChange(snap({ status: "CANCELLED" }), snap()).kind).toBe("REACTIVATED");
  });

  it("treats a discount on the same plan as a price change, not a downgrade", () => {
    const event = classifyChange(snap(), snap({ agreedPricePaise: 149_900 }));
    expect(event.kind).toBe("PRICE_CHANGED");
    expect(event.toValuePaise).toBe(149_900);
  });

  it("treats switching to annual as a price change", () => {
    // ₹19,188/yr is ₹1,599/month - less per month than ₹1,999, but not a downgrade.
    const event = classifyChange(snap(), snap({ billingPeriod: "ANNUAL" }));
    expect(event.kind).toBe("PRICE_CHANGED");
    expect(event.toValuePaise).toBe(159_900);
  });

  it("records a trial being extended", () => {
    expect(classifyChange(snap({ status: "TRIALING" }), snap({ status: "TRIALING" })).kind).toBe("TRIAL_EXTENDED");
  });

  it("records an unchanged paying subscription as a renewal", () => {
    expect(classifyChange(snap(), snap()).kind).toBe("RENEWED");
  });
});

describe("netRevenueRetention", () => {
  it("is 100% when nothing moves", () => {
    expect(netRevenueRetention({ startingMrr: 100_000, expansion: 0, contraction: 0, churned: 0 })).toBe(100);
  });

  /** Above 100 is the healthy state: the existing base grows without new sales. */
  it("exceeds 100% when upgrades outweigh losses", () => {
    expect(netRevenueRetention({ startingMrr: 100_000, expansion: 15_000, contraction: 2_000, churned: 3_000 })).toBe(110);
  });

  it("falls below 100% when the bucket leaks", () => {
    expect(netRevenueRetention({ startingMrr: 100_000, expansion: 2_000, contraction: 4_000, churned: 10_000 })).toBe(88);
  });

  it("is zero rather than infinite with no starting revenue", () => {
    expect(netRevenueRetention({ startingMrr: 0, expansion: 5_000, contraction: 0, churned: 0 })).toBe(0);
  });

  /**
   * The distinction that matters: expansion can hide real churn. Gross retention refuses to let it.
   */
  it("gross retention ignores expansion, so losses stay visible", () => {
    const period = { startingMrr: 100_000, expansion: 20_000, contraction: 0, churned: 15_000 };
    expect(netRevenueRetention(period)).toBe(105);
    expect(grossRevenueRetention(period)).toBe(85);
  });
});
