/**
 * Coupon eligibility and discount maths.
 *
 * Pure functions, so the money logic can be proven without a database. The caller supplies the
 * redemption counts it read inside the checkout transaction - this module never decides whether
 * a race was lost, it only decides whether the numbers it was given permit the redemption.
 */

export type DiscountType = "PERCENT" | "FLAT";

export type CouponRules = {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minBillAmount?: number | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  maxRedemptions?: number | null;
  maxPerCustomer?: number | null;
  newCustomersOnly: boolean;
  serviceIds: string[];
  productIds: string[];
  serviceCategoryIds: string[];
  productCategoryIds: string[];
  branchIds: string[];
  isActive: boolean;
};

export type CouponCartLine = {
  type: "SERVICE" | "PRODUCT";
  itemId: string;
  categoryId?: string | null;
  /** Line value after line-level discounts, before tax. What a coupon can act on. */
  netAmount: number;
};

export type CouponContext = {
  branchId: string;
  /** Null for a walk-in with no profile yet. */
  customerId: string | null;
  /** True when this is the customer's first ever invoice. */
  isNewCustomer: boolean;
  cart: CouponCartLine[];
  /** Redemptions of this coupon across all customers, read inside the transaction. */
  totalRedemptions: number;
  /** Redemptions of this coupon by this customer. */
  customerRedemptions: number;
  now?: Date;
};

export type CouponResult =
  | { ok: true; couponId: string; code: string; discount: number; eligibleBase: number }
  | { ok: false; reason: string };

function money(value: number) {
  return Number(value.toFixed(2));
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The portion of the cart a coupon may discount.
 *
 * An empty restriction list means "no restriction of this kind". A line qualifies if it matches
 * any restriction that was actually specified. A coupon restricted to colour services must not
 * discount the shampoo sold alongside it.
 */
export function eligibleBase(coupon: CouponRules, cart: CouponCartLine[]) {
  const unrestricted = !coupon.serviceIds.length
    && !coupon.productIds.length
    && !coupon.serviceCategoryIds.length
    && !coupon.productCategoryIds.length;

  if (unrestricted) return money(cart.reduce((sum, line) => sum + line.netAmount, 0));

  const matching = cart.filter((line) => {
    if (line.type === "SERVICE") {
      return coupon.serviceIds.includes(line.itemId)
        || (line.categoryId ? coupon.serviceCategoryIds.includes(line.categoryId) : false);
    }
    return coupon.productIds.includes(line.itemId)
      || (line.categoryId ? coupon.productCategoryIds.includes(line.categoryId) : false);
  });

  return money(matching.reduce((sum, line) => sum + line.netAmount, 0));
}

/**
 * The discount a coupon takes off a given base.
 *
 * A percent discount is capped by `maxDiscountAmount` when set, and no discount may ever exceed
 * the base it applies to - a coupon must not be able to make a bill negative.
 */
export function couponDiscount(coupon: CouponRules, base: number) {
  if (base <= 0) return 0;
  const raw = coupon.discountType === "PERCENT"
    ? base * coupon.discountValue / 100
    : coupon.discountValue;
  const capped = coupon.maxDiscountAmount != null ? Math.min(raw, coupon.maxDiscountAmount) : raw;
  return money(Math.max(0, Math.min(capped, base)));
}

/** Total cart value, used for the minimum-bill test. */
export function cartTotal(cart: CouponCartLine[]) {
  return money(cart.reduce((sum, line) => sum + line.netAmount, 0));
}

/**
 * Decide whether a coupon may be redeemed, and for how much.
 *
 * Every rejection carries a message written for the person at the counter, not for a developer.
 */
export function applyCoupon(coupon: CouponRules, context: CouponContext): CouponResult {
  const now = context.now ?? new Date();

  if (!coupon.isActive) return { ok: false, reason: "This coupon is no longer active." };

  const startsAt = toDate(coupon.startsAt);
  const endsAt = toDate(coupon.endsAt);
  if (startsAt && now < startsAt) {
    return { ok: false, reason: `This coupon is not valid until ${startsAt.toDateString()}.` };
  }
  if (endsAt && now > endsAt) {
    return { ok: false, reason: "This coupon has expired." };
  }

  if (coupon.branchIds.length && !coupon.branchIds.includes(context.branchId)) {
    return { ok: false, reason: "This coupon cannot be used at this branch." };
  }

  if (coupon.maxRedemptions != null && context.totalRedemptions >= coupon.maxRedemptions) {
    return { ok: false, reason: "This coupon has been fully used up." };
  }

  if (coupon.newCustomersOnly && !context.isNewCustomer) {
    return { ok: false, reason: "This coupon is only for first-time customers." };
  }

  if (coupon.maxPerCustomer != null) {
    if (!context.customerId) {
      return { ok: false, reason: "Select a customer before applying this coupon." };
    }
    if (context.customerRedemptions >= coupon.maxPerCustomer) {
      return { ok: false, reason: "This customer has already used this coupon." };
    }
  }

  const total = cartTotal(context.cart);
  if (coupon.minBillAmount != null && total < coupon.minBillAmount) {
    const shortfall = money(coupon.minBillAmount - total);
    return { ok: false, reason: `Add ${shortfall} more to the bill to use this coupon.` };
  }

  const base = eligibleBase(coupon, context.cart);
  if (base <= 0) {
    return { ok: false, reason: "Nothing in this bill qualifies for this coupon." };
  }

  const discount = couponDiscount(coupon, base);
  if (discount <= 0) {
    return { ok: false, reason: "This coupon does not reduce this bill." };
  }

  return { ok: true, couponId: coupon.id, code: coupon.code, discount, eligibleBase: base };
}

/**
 * Spread a bill-level coupon discount across the lines it applies to.
 *
 * A coupon is a discount on the bill, but GST is computed per line, so the discount has to land
 * on individual lines or the tax will be wrong. Allocation is proportional to each qualifying
 * line's value, with the rounding remainder pushed onto the largest line so the parts sum to the
 * whole exactly.
 */
export function allocateCouponDiscount(coupon: CouponRules, cart: CouponCartLine[], discount: number) {
  const qualifying = cart.filter((line) => eligibleBase(coupon, [line]) > 0);
  const base = money(qualifying.reduce((sum, line) => sum + line.netAmount, 0));
  if (base <= 0 || discount <= 0) return new Map<string, number>();

  const allocations = new Map<string, number>();
  let allocated = 0;

  for (const line of qualifying) {
    const share = money(discount * (line.netAmount / base));
    const capped = money(Math.min(share, line.netAmount));
    allocations.set(`${line.type}-${line.itemId}`, capped);
    allocated = money(allocated + capped);
  }

  const remainder = money(discount - allocated);
  if (Math.abs(remainder) >= 0.01) {
    const largest = [...qualifying].sort((left, right) => right.netAmount - left.netAmount)[0];
    if (largest) {
      const key = `${largest.type}-${largest.itemId}`;
      const current = allocations.get(key) ?? 0;
      allocations.set(key, money(Math.min(largest.netAmount, Math.max(0, current + remainder))));
    }
  }

  return allocations;
}
