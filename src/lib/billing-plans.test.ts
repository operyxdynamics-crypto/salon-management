import { describe, expect, it } from "vitest";
import {
  accessFor,
  addGst,
  annualPerMonthPaise,
  annualSavingPercent,
  checkLimit,
  cycleCharge,
  formatPlanPrice,
  isUnlimited,
} from "./billing-plans";

/** The Salon tier: ₹1,999/month, ₹19,188/year, ₹1,999 setup. */
const SALON = { monthlyPricePaise: 199_900, annualPricePaise: 1_918_800, setupFeePaise: 199_900 };

describe("money", () => {
  it("formats whole rupees the Indian way", () => {
    expect(formatPlanPrice(199_900)).toBe("₹1,999");
    expect(formatPlanPrice(1_918_800)).toBe("₹19,188");
    // Indian grouping: 1,15,188 not 115,188.
    expect(formatPlanPrice(11_518_800)).toBe("₹1,15,188");
  });

  it("adds 18% GST without drifting", () => {
    expect(addGst(199_900)).toEqual({ net: 199_900, tax: 35_982, gross: 235_882 });
  });

  /** The bug this guards: 0.1 + 0.2 in rupees. Integers make it impossible. */
  it("stays exact across many cycles", () => {
    let total = 0;
    for (let month = 0; month < 12; month += 1) total += addGst(199_900).gross;
    expect(total).toBe(2_830_584);
    expect(Number.isInteger(total)).toBe(true);
  });
});

describe("cycleCharge", () => {
  it("charges the setup fee once, on the first monthly cycle", () => {
    const first = cycleCharge(SALON, "MONTHLY", true);
    expect(first.setup).toBe(199_900);
    expect(first.net).toBe(399_800);

    const second = cycleCharge(SALON, "MONTHLY", false);
    expect(second.setup).toBe(0);
    expect(second.net).toBe(199_900);
  });

  /** Annual already covers onboarding, so the fee is waived - a reason to commit. */
  it("waives the setup fee on annual", () => {
    const annual = cycleCharge(SALON, "ANNUAL", true);
    expect(annual.setup).toBe(0);
    expect(annual.net).toBe(1_918_800);
  });

  it("includes GST in the gross", () => {
    expect(cycleCharge(SALON, "ANNUAL", true).gross).toBe(2_264_184);
  });
});

describe("annual saving", () => {
  it("reports the discount, rounded down so the claim is never overstated", () => {
    expect(annualSavingPercent(SALON)).toBe(20);
  });

  it("shows the monthly equivalent for the billed-annually line", () => {
    expect(annualPerMonthPaise(SALON)).toBe(159_900);
    expect(formatPlanPrice(annualPerMonthPaise(SALON))).toBe("₹1,599");
  });

  it("does not claim a saving when there is none", () => {
    expect(annualSavingPercent({ monthlyPricePaise: 0, annualPricePaise: 0, setupFeePaise: 0 })).toBe(0);
  });
});

describe("accessFor", () => {
  const now = new Date("2026-07-17T10:00:00Z");
  const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const base = { trialEndsAt: null, currentPeriodEnd: null, pastDueSince: null };

  it("is silent and full when active", () => {
    expect(accessFor({ ...base, status: "ACTIVE" }, now)).toMatchObject({ level: "FULL", message: null });
  });

  it("says nothing early in a trial", () => {
    const result = accessFor({ ...base, status: "TRIALING", trialEndsAt: inDays(11) }, now);
    expect(result.level).toBe("FULL");
    expect(result.message).toBeNull();
    expect(result.daysRemaining).toBe(11);
  });

  it("warns in the last three days", () => {
    const result = accessFor({ ...base, status: "TRIALING", trialEndsAt: inDays(2) }, now);
    expect(result.level).toBe("FULL");
    expect(result.message).toBe("2 days left in your trial.");
    expect(result.urgent).toBe(true);
  });

  it("drops to read-only when the trial expires", () => {
    expect(accessFor({ ...base, status: "TRIALING", trialEndsAt: daysAgo(1) }, now).level).toBe("READ_ONLY");
  });

  /**
   * The grace ladder. A bounced mandate is a bank problem discovered mid-shift, so nothing is cut
   * off on the day it fails.
   */
  it("keeps a salon fully working for the first week past due", () => {
    const result = accessFor({ ...base, status: "PAST_DUE", pastDueSince: daysAgo(3) }, now);
    expect(result.level).toBe("FULL");
    expect(result.urgent).toBe(true);
    expect(result.daysRemaining).toBe(4);
  });

  it("goes read-only in the second week", () => {
    expect(accessFor({ ...base, status: "PAST_DUE", pastDueSince: daysAgo(9) }, now).level).toBe("READ_ONLY");
  });

  it("suspends after two weeks", () => {
    const result = accessFor({ ...base, status: "PAST_DUE", pastDueSince: daysAgo(20) }, now);
    expect(result.level).toBe("READ_ONLY");
    expect(result.daysRemaining).toBe(0);
  });

  /**
   * Never BLOCKED. A salon's invoices are its own legal records, retained by law - withholding
   * them over an unpaid bill would be both wrong and arguably unlawful.
   */
  it("never takes away read access, even suspended or cancelled", () => {
    expect(accessFor({ ...base, status: "SUSPENDED" }, now).level).toBe("READ_ONLY");
    expect(accessFor({ ...base, status: "CANCELLED" }, now).level).toBe("READ_ONLY");
  });
});

describe("checkLimit", () => {
  it("allows below the limit", () => {
    expect(checkLimit("staff", 12, 15, "Salon").allowed).toBe(true);
  });

  it("blocks at the limit and names the way out", () => {
    const result = checkLimit("staff", 15, 15, "Salon", "Group");
    expect(result.allowed).toBe(false);
    expect(result.message).toBe("Salon includes 15 team members, and you're using 15. Upgrade to Group for more.");
  });

  it("gets the singular right", () => {
    expect(checkLimit("branches", 1, 1, "Salon", "Group").message).toBe("Salon includes 1 branch, and you're using 1. Upgrade to Group for more.");
  });

  it("falls back to contact-us on the top plan", () => {
    expect(checkLimit("staff", 50, 50, "Group").message).toContain("Contact us");
  });

  /** Zero means no ceiling, which is how Franchise is expressed. */
  it("treats a non-positive limit as unlimited", () => {
    expect(isUnlimited(0)).toBe(true);
    expect(checkLimit("branches", 9999, 0, "Franchise").allowed).toBe(true);
  });
});
