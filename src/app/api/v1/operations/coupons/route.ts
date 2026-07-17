import { z } from "zod";
import { resolveCoupon } from "@/lib/coupon-service";
import { allocateCouponDiscount } from "@/lib/coupons";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

/**
 * Kept as a plain object so `.partial()` can derive the PATCH schema from it. A schema that ends
 * in `.refine()` is a ZodEffects, not a ZodObject, and calling `.partial()` on one throws at
 * module load - which took the whole route down, not just the request.
 */
const couponFields = z.object({
  branchId: z.string().optional(),
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphen or underscore only"),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).optional().nullable(),
  discountType: z.enum(["PERCENT", "FLAT"]),
  discountValue: z.number().positive(),
  maxDiscountAmount: z.number().positive().optional().nullable(),
  minBillAmount: z.number().min(0).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  maxRedemptions: z.number().int().positive().optional().nullable(),
  maxPerCustomer: z.number().int().positive().optional().nullable(),
  newCustomersOnly: z.boolean().default(false),
  serviceIds: z.array(z.string()).default([]),
  productIds: z.array(z.string()).default([]),
  serviceCategoryIds: z.array(z.string()).default([]),
  productCategoryIds: z.array(z.string()).default([]),
  branchIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

const percentWithinRange = (value: { discountType?: "PERCENT" | "FLAT"; discountValue?: number }) =>
  value.discountType !== "PERCENT" || value.discountValue == null || value.discountValue <= 100;

const couponSchema = couponFields.refine(percentWithinRange, {
  message: "A percentage discount cannot exceed 100",
  path: ["discountValue"],
});

export async function GET(request: Request) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId") ?? "all";
    const context = await requireOperationsContext("service:read", { branchId, allowAll: true });
    const coupons = await db.coupon.findMany({
      where: { tenantId: context.tenant.id },
      include: { _count: { select: { redemptions: true } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    return Response.json({
      data: coupons.map((coupon) => ({
        ...coupon,
        discountValue: Number(coupon.discountValue),
        maxDiscountAmount: coupon.maxDiscountAmount === null ? null : Number(coupon.maxDiscountAmount),
        minBillAmount: coupon.minBillAmount === null ? null : Number(coupon.minBillAmount),
        redemptionCount: coupon._count.redemptions,
        /** Null means unlimited, so there is nothing left to count down. */
        remaining: coupon.maxRedemptions === null ? null : Math.max(0, coupon.maxRedemptions - coupon._count.redemptions),
      })),
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = couponSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid coupon", 400, parsed.error.flatten());
    // Coupons belong to the tenant, so no specific branch is required to manage them. (Which
    // branches a coupon may be *used* at is a field on the coupon: `branchIds`.)
    const context = await requireOperationsContext("branch:manage", { branchId: "all", allowAll: true });

    const { branchId, startsAt, endsAt, ...rest } = parsed.data;
    void branchId;
    try {
      const created = await db.coupon.create({
        data: {
          ...rest,
          code: rest.code.toUpperCase(),
          tenantId: context.tenant.id,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
        },
      });
      await db.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "COUPON_CREATED",
          entity: "Coupon",
          entityId: created.id,
          metadata: { code: created.code },
        },
      });
      return Response.json({ data: created }, { status: 201 });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code === "P2002") throw new OperationsError("CONFLICT", "A coupon with that code already exists", 409);
      throw error;
    }
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

const patchSchema = couponFields
  .partial()
  .extend({ id: z.string().min(1), branchId: z.string().optional() })
  .refine(percentWithinRange, { message: "A percentage discount cannot exceed 100", path: ["discountValue"] });

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid coupon", 400, parsed.error.flatten());
    // Coupons belong to the tenant, so no specific branch is required to manage them. (Which
    // branches a coupon may be *used* at is a field on the coupon: `branchIds`.)
    const context = await requireOperationsContext("branch:manage", { branchId: "all", allowAll: true });

    const { id, branchId, startsAt, endsAt, ...rest } = parsed.data;
    void branchId;
    const changed = await db.coupon.updateMany({
      where: { id, tenantId: context.tenant.id },
      data: {
        ...rest,
        ...(rest.code ? { code: rest.code.toUpperCase() } : {}),
        ...(startsAt !== undefined ? { startsAt: startsAt ? new Date(startsAt) : null } : {}),
        ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
      },
    });
    if (changed.count !== 1) throw new OperationsError("NOT_FOUND", "Coupon not found", 404);

    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "COUPON_UPDATED",
        entity: "Coupon",
        entityId: id,
        metadata: { fields: Object.keys(rest) },
      },
    });
    return Response.json({ data: { id } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

const validateSchema = z.object({
  branchId: z.string().min(1),
  code: z.string().trim().min(1).max(40),
  customerId: z.string().min(1).optional().nullable(),
  cart: z.array(z.object({
    type: z.enum(["SERVICE", "PRODUCT"]),
    itemId: z.string().min(1),
    categoryId: z.string().optional().nullable(),
    netAmount: z.number().min(0),
  })).min(1),
});

/**
 * POS preview. Tells the counter whether a code works and what it takes off, before payment.
 *
 * This is advisory only - checkout re-runs the same check inside its transaction, because the
 * usage cap can be exhausted between the preview and the charge.
 */
export async function PUT(request: Request) {
  try {
    const parsed = validateSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid coupon check", 400, parsed.error.flatten());
    const context = await requireOperationsContext("sale:write", { branchId: parsed.data.branchId, requireBranch: true });

    const { result, rules } = await resolveCoupon(db, {
      tenantId: context.tenant.id,
      branchId: context.branch!.id,
      code: parsed.data.code,
      customerId: parsed.data.customerId ?? null,
      cart: parsed.data.cart,
    });

    // Hand back the per-line split, not just the total. The POS shows GST as it computes the
    // cart, so it has to fold the discount into the same lines the server will - otherwise the
    // tax on screen would not match the tax on the invoice.
    const allocations = result.ok && rules
      ? [...allocateCouponDiscount(rules, parsed.data.cart, result.discount).entries()].map(([key, amount]) => ({ key, amount }))
      : [];

    return Response.json({ data: { result, allocations } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
