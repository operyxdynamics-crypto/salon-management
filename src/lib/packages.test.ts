import { describe, expect, it } from "vitest";
import { addOnMonthlyPaise, buildQuote, describeLimits, effectiveLimits, nearingLimits, type AddOnLine } from "./packages";

const GROUP = { name: "Group", monthlyPricePaise: 499_900, maxBranches: 5, maxStaff: 50, maxServices: 0, maxMonthlyAppointments: 5_000 };
const FRANCHISE = { name: "Franchise", monthlyPricePaise: 1_199_900, maxBranches: 0, maxStaff: 0, maxServices: 0, maxMonthlyAppointments: 0 };

const pack = (over: Partial<AddOnLine> = {}): AddOnLine => ({
  code: "extra_appointments", name: "Extra appointments", limitField: "maxMonthlyAppointments",
  unitAmount: 500, unitPricePaise: 50_000, quantity: 1, isMetered: false, ...over,
});

describe("effectiveLimits", () => {
  it("leaves the base alone when nothing is bought", () => {
    expect(effectiveLimits(GROUP, [])).toMatchObject({ maxBranches: 5, maxMonthlyAppointments: 5_000 });
  });

  /** The exact case that broke the old model: out of bookings, not out of branches. */
  it("adds bookings without touching the tier", () => {
    const limits = effectiveLimits(GROUP, [pack({ quantity: 2 })]);
    expect(limits.maxMonthlyAppointments).toBe(6_000);
    expect(limits.maxBranches).toBe(5);
  });

  it("adds branches and staff independently", () => {
    const limits = effectiveLimits(GROUP, [
      pack({ code: "extra_branch", limitField: "maxBranches", unitAmount: 1, quantity: 3 }),
      pack({ code: "extra_staff", limitField: "maxStaff", unitAmount: 5, quantity: 2 }),
    ]);
    expect(limits.maxBranches).toBe(8);
    expect(limits.maxStaff).toBe(60);
  });

  /**
   * A pack must never turn "no ceiling" into a number - that is a silent downgrade the salon would
   * discover by being blocked mid-shift.
   */
  it("keeps unlimited unlimited", () => {
    expect(effectiveLimits(FRANCHISE, [pack({ quantity: 4 })]).maxMonthlyAppointments).toBe(0);
  });

  it("ignores metered add-ons, which are not a limit", () => {
    const limits = effectiveLimits(GROUP, [pack({ code: "whatsapp", limitField: null, isMetered: true, quantity: 3 })]);
    expect(limits).toMatchObject({ maxMonthlyAppointments: 5_000, maxBranches: 5 });
  });

  it("ignores a zero or negative quantity", () => {
    expect(effectiveLimits(GROUP, [pack({ quantity: 0 })]).maxMonthlyAppointments).toBe(5_000);
  });
});

describe("addOnMonthlyPaise", () => {
  it("multiplies price by quantity", () => {
    expect(addOnMonthlyPaise([pack({ quantity: 2 })])).toBe(100_000);
  });

  it("sums across different add-ons", () => {
    expect(addOnMonthlyPaise([
      pack({ quantity: 2 }),
      pack({ code: "extra_branch", unitPricePaise: 80_000, quantity: 1 }),
    ])).toBe(180_000);
  });

  it("is zero for an empty basket", () => {
    expect(addOnMonthlyPaise([])).toBe(0);
  });
});

describe("buildQuote", () => {
  it("quotes the plan alone with GST", () => {
    const quote = buildQuote(GROUP, []);
    expect(quote.netMonthlyPaise).toBe(499_900);
    expect(quote.taxPaise).toBe(89_982);
    expect(quote.grossMonthlyPaise).toBe(589_882);
  });

  it("adds packs to the total and the limits together", () => {
    const quote = buildQuote(GROUP, [pack({ quantity: 2 })]);
    expect(quote.netMonthlyPaise).toBe(599_900);
    expect(quote.limits.maxMonthlyAppointments).toBe(6_000);
  });

  /** Every line shows its own arithmetic, so the salon owner can check the sum themselves. */
  it("shows the working on each line", () => {
    const quote = buildQuote(GROUP, [pack({ quantity: 2 })]);
    expect(quote.lines).toHaveLength(2);
    expect(quote.lines[0].detail).toContain("5 branches");
    expect(quote.lines[1].detail).toBe("2 × 500");
  });

  it("leaves out packs with no quantity", () => {
    expect(buildQuote(GROUP, [pack({ quantity: 0 })]).lines).toHaveLength(1);
  });
});

describe("describeLimits", () => {
  it("says unlimited rather than zero", () => {
    expect(describeLimits(FRANCHISE)).toBe("unlimited branches · unlimited staff · unlimited bookings/mo");
  });

  it("gets the singular branch right and groups Indian numbers", () => {
    expect(describeLimits({ maxBranches: 1, maxStaff: 15, maxServices: 0, maxMonthlyAppointments: 100_000 }))
      .toBe("1 branch · 15 staff · 1,00,000 bookings/mo");
  });
});

describe("nearingLimits", () => {
  it("stays quiet well below the ceiling", () => {
    expect(nearingLimits(GROUP, { maxMonthlyAppointments: 2_000 })).toEqual([]);
  });

  /** Called two weeks early this is an upsell; discovered at the wall it is a complaint. */
  it("flags a limit at 80% or more", () => {
    const [check] = nearingLimits(GROUP, { maxMonthlyAppointments: 4_200 });
    expect(check).toMatchObject({ field: "maxMonthlyAppointments", used: 4_200, limit: 5_000, percent: 84 });
  });

  it("puts the most urgent first", () => {
    const checks = nearingLimits(GROUP, { maxMonthlyAppointments: 4_100, maxBranches: 5 });
    expect(checks[0].field).toBe("maxBranches");
    expect(checks[0].percent).toBe(100);
  });

  it("never warns about an unlimited plan", () => {
    expect(nearingLimits(FRANCHISE, { maxMonthlyAppointments: 999_999, maxBranches: 80 })).toEqual([]);
  });

  it("skips limits with no usage supplied", () => {
    expect(nearingLimits(GROUP, {})).toEqual([]);
  });
});
