import { Prisma } from "@prisma/client";
import { applyCoupon, type CouponCartLine, type CouponResult, type CouponRules } from "@/lib/coupons";

/**
 * Server-side coupon resolution.
 *
 * Kept separate from `@/lib/coupons` (pure maths) and usable with either the Prisma client or a
 * transaction client, because the usage caps MUST be checked inside the checkout transaction.
 *
 * Two receptionists can redeem the last use of a 100-use coupon at the same instant. Checking
 * the count outside the transaction and inserting inside it is a lost update waiting to happen.
 */

type TxClient = Prisma.TransactionClient | typeof import("@/lib/db").db;

export function toCouponRules(row: {
  id: string;
  code: string;
  discountType: string;
  discountValue: Prisma.Decimal;
  maxDiscountAmount: Prisma.Decimal | null;
  minBillAmount: Prisma.Decimal | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  newCustomersOnly: boolean;
  serviceIds: string[];
  productIds: string[];
  serviceCategoryIds: string[];
  productCategoryIds: string[];
  branchIds: string[];
  isActive: boolean;
}): CouponRules {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType === "FLAT" ? "FLAT" : "PERCENT",
    discountValue: Number(row.discountValue),
    maxDiscountAmount: row.maxDiscountAmount === null ? null : Number(row.maxDiscountAmount),
    minBillAmount: row.minBillAmount === null ? null : Number(row.minBillAmount),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    maxPerCustomer: row.maxPerCustomer,
    newCustomersOnly: row.newCustomersOnly,
    serviceIds: row.serviceIds,
    productIds: row.productIds,
    serviceCategoryIds: row.serviceCategoryIds,
    productCategoryIds: row.productCategoryIds,
    branchIds: row.branchIds,
    isActive: row.isActive,
  };
}

/**
 * Look the coupon up and decide whether it may be redeemed right now.
 *
 * Pass the transaction client at checkout so the counts are read under the same snapshot that
 * inserts the redemption. Pass the plain client for the POS preview, where a stale count is fine
 * because checkout will re-check anyway.
 */
export async function resolveCoupon(tx: TxClient, {
  tenantId,
  branchId,
  code,
  customerId,
  cart,
}: {
  tenantId: string;
  branchId: string;
  code: string;
  customerId: string | null;
  cart: CouponCartLine[];
}): Promise<{ result: CouponResult; rules: CouponRules | null }> {
  const coupon = await tx.coupon.findFirst({
    where: { tenantId, code: { equals: code.trim(), mode: "insensitive" } },
  });
  if (!coupon) return { result: { ok: false, reason: "That coupon code was not found." }, rules: null };

  const [totalRedemptions, customerRedemptions, previousInvoices] = await Promise.all([
    tx.couponRedemption.count({ where: { couponId: coupon.id } }),
    customerId ? tx.couponRedemption.count({ where: { couponId: coupon.id, customerId } }) : Promise.resolve(0),
    customerId ? tx.invoice.count({ where: { customerId, type: "SALE", status: { not: "VOID" } } }) : Promise.resolve(0),
  ]);

  const rules = toCouponRules(coupon);
  const result = applyCoupon(rules, {
    branchId,
    customerId,
    isNewCustomer: previousInvoices === 0,
    cart,
    totalRedemptions,
    customerRedemptions,
  });
  return { result, rules };
}
