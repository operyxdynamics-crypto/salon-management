import { describe, expect, it } from "vitest";
import {
  allocateCouponDiscount,
  applyCoupon,
  cartTotal,
  couponDiscount,
  eligibleBase,
  type CouponCartLine,
  type CouponContext,
  type CouponRules,
} from "./coupons";

function coupon(overrides: Partial<CouponRules> = {}): CouponRules {
  return {
    id: "coupon_1",
    code: "MONSOON20",
    discountType: "PERCENT",
    discountValue: 20,
    maxDiscountAmount: null,
    minBillAmount: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    maxPerCustomer: null,
    newCustomersOnly: false,
    serviceIds: [],
    productIds: [],
    serviceCategoryIds: [],
    productCategoryIds: [],
    branchIds: [],
    isActive: true,
    ...overrides,
  };
}

const colourService: CouponCartLine = { type: "SERVICE", itemId: "svc_colour", categoryId: "cat_colour", netAmount: 2000 };
const haircut: CouponCartLine = { type: "SERVICE", itemId: "svc_cut", categoryId: "cat_hair", netAmount: 600 };
const shampoo: CouponCartLine = { type: "PRODUCT", itemId: "prd_shampoo", categoryId: "cat_haircare", netAmount: 400 };

function context(overrides: Partial<CouponContext> = {}): CouponContext {
  return {
    branchId: "branch_1",
    customerId: "cust_1",
    isNewCustomer: false,
    cart: [colourService, haircut, shampoo],
    totalRedemptions: 0,
    customerRedemptions: 0,
    now: new Date("2026-07-14T10:00:00+05:30"),
    ...overrides,
  };
}

describe("couponDiscount", () => {
  it("takes a percentage off the base", () => {
    expect(couponDiscount(coupon({ discountType: "PERCENT", discountValue: 20 }), 1000)).toBe(200);
  });

  it("takes a flat amount off the base", () => {
    expect(couponDiscount(coupon({ discountType: "FLAT", discountValue: 250 }), 1000)).toBe(250);
  });

  it("respects the cap on a percentage discount", () => {
    // "20% off, up to 500" on a 5,000 bill is 500, not 1,000.
    const capped = coupon({ discountType: "PERCENT", discountValue: 20, maxDiscountAmount: 500 });
    expect(couponDiscount(capped, 5000)).toBe(500);
  });

  it("never discounts more than the base, so a bill cannot go negative", () => {
    const huge = coupon({ discountType: "FLAT", discountValue: 5000 });
    expect(couponDiscount(huge, 800)).toBe(800);
  });

  it("returns nothing on an empty base", () => {
    expect(couponDiscount(coupon(), 0)).toBe(0);
  });
});

describe("eligibleBase", () => {
  it("uses the whole cart when the coupon has no restrictions", () => {
    expect(eligibleBase(coupon(), [colourService, haircut, shampoo])).toBe(3000);
  });

  it("counts only the named services", () => {
    const restricted = coupon({ serviceIds: ["svc_colour"] });
    expect(eligibleBase(restricted, [colourService, haircut, shampoo])).toBe(2000);
  });

  it("counts a whole service category", () => {
    const restricted = coupon({ serviceCategoryIds: ["cat_colour"] });
    expect(eligibleBase(restricted, [colourService, haircut, shampoo])).toBe(2000);
  });

  it("does not let a service-only coupon discount retail products", () => {
    const restricted = coupon({ serviceCategoryIds: ["cat_colour", "cat_hair"] });
    expect(eligibleBase(restricted, [colourService, haircut, shampoo])).toBe(2600);
  });

  it("returns zero when nothing in the cart qualifies", () => {
    const restricted = coupon({ serviceIds: ["svc_facial"] });
    expect(eligibleBase(restricted, [colourService, haircut, shampoo])).toBe(0);
  });
});

describe("applyCoupon", () => {
  it("applies a valid coupon to the whole bill", () => {
    const result = applyCoupon(coupon(), context());
    expect(result).toMatchObject({ ok: true, discount: 600, eligibleBase: 3000 });
  });

  it("discounts only the restricted portion", () => {
    const result = applyCoupon(coupon({ serviceCategoryIds: ["cat_colour"] }), context());
    // 20% of the 2,000 colour service, not of the 3,000 bill.
    expect(result).toMatchObject({ ok: true, discount: 400, eligibleBase: 2000 });
  });

  it("rejects an inactive coupon", () => {
    const result = applyCoupon(coupon({ isActive: false }), context());
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects a coupon that has not started", () => {
    const result = applyCoupon(coupon({ startsAt: "2026-08-01T00:00:00Z" }), context());
    expect(result.ok).toBe(false);
  });

  it("rejects an expired coupon", () => {
    const result = applyCoupon(coupon({ endsAt: "2026-06-30T00:00:00Z" }), context());
    expect(result).toMatchObject({ ok: false, reason: "This coupon has expired." });
  });

  it("rejects a coupon at the wrong branch", () => {
    const result = applyCoupon(coupon({ branchIds: ["branch_2"] }), context({ branchId: "branch_1" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a coupon that has been fully used up", () => {
    const result = applyCoupon(coupon({ maxRedemptions: 100 }), context({ totalRedemptions: 100 }));
    expect(result).toMatchObject({ ok: false, reason: "This coupon has been fully used up." });
  });

  it("allows the very last redemption", () => {
    const result = applyCoupon(coupon({ maxRedemptions: 100 }), context({ totalRedemptions: 99 }));
    expect(result.ok).toBe(true);
  });

  it("rejects a second use by the same customer when limited to one", () => {
    const result = applyCoupon(coupon({ maxPerCustomer: 1 }), context({ customerRedemptions: 1 }));
    expect(result.ok).toBe(false);
  });

  it("requires a customer when the coupon is limited per customer", () => {
    const result = applyCoupon(coupon({ maxPerCustomer: 1 }), context({ customerId: null }));
    expect(result).toMatchObject({ ok: false, reason: "Select a customer before applying this coupon." });
  });

  it("rejects a new-customer coupon for a returning customer", () => {
    const result = applyCoupon(coupon({ newCustomersOnly: true }), context({ isNewCustomer: false }));
    expect(result.ok).toBe(false);
  });

  it("accepts a new-customer coupon for a first-time customer", () => {
    const result = applyCoupon(coupon({ newCustomersOnly: true }), context({ isNewCustomer: true }));
    expect(result.ok).toBe(true);
  });

  it("rejects a bill below the minimum and says how much short it is", () => {
    const result = applyCoupon(coupon({ minBillAmount: 5000 }), context());
    expect(result).toMatchObject({ ok: false, reason: "Add 2000 more to the bill to use this coupon." });
  });

  it("accepts a bill exactly on the minimum", () => {
    const result = applyCoupon(coupon({ minBillAmount: 3000 }), context());
    expect(result.ok).toBe(true);
  });

  it("rejects when nothing in the cart qualifies", () => {
    const result = applyCoupon(coupon({ serviceIds: ["svc_facial"] }), context());
    expect(result).toMatchObject({ ok: false, reason: "Nothing in this bill qualifies for this coupon." });
  });
});

describe("allocateCouponDiscount", () => {
  it("spreads a bill-level discount across lines so per-line GST stays correct", () => {
    const rules = coupon();
    const cart = [colourService, haircut, shampoo];
    const allocations = allocateCouponDiscount(rules, cart, 600);

    const total = Number([...allocations.values()].reduce((sum, value) => sum + value, 0).toFixed(2));
    expect(total).toBe(600);
    expect(allocations.get("SERVICE-svc_colour")).toBe(400);
    expect(allocations.get("SERVICE-svc_cut")).toBe(120);
    expect(allocations.get("PRODUCT-prd_shampoo")).toBe(80);
  });

  it("only touches the lines the coupon applies to", () => {
    const rules = coupon({ serviceCategoryIds: ["cat_colour"] });
    const allocations = allocateCouponDiscount(rules, [colourService, haircut, shampoo], 400);
    expect(allocations.get("SERVICE-svc_colour")).toBe(400);
    expect(allocations.has("SERVICE-svc_cut")).toBe(false);
    expect(allocations.has("PRODUCT-prd_shampoo")).toBe(false);
  });

  it("balances to the exact discount when shares do not divide cleanly", () => {
    const cart: CouponCartLine[] = [
      { type: "SERVICE", itemId: "a", categoryId: null, netAmount: 333.33 },
      { type: "SERVICE", itemId: "b", categoryId: null, netAmount: 333.33 },
      { type: "SERVICE", itemId: "c", categoryId: null, netAmount: 333.34 },
    ];
    const allocations = allocateCouponDiscount(coupon(), cart, 100.01);
    const total = Number([...allocations.values()].reduce((sum, value) => sum + value, 0).toFixed(2));
    expect(total).toBe(100.01);
  });

  it("never takes more off a line than the line is worth", () => {
    const cart: CouponCartLine[] = [{ type: "SERVICE", itemId: "a", categoryId: null, netAmount: 100 }];
    const allocations = allocateCouponDiscount(coupon({ discountType: "FLAT", discountValue: 500 }), cart, 100);
    expect(allocations.get("SERVICE-a")).toBe(100);
  });
});

describe("cartTotal", () => {
  it("adds the lines", () => {
    expect(cartTotal([colourService, haircut, shampoo])).toBe(3000);
  });
});
