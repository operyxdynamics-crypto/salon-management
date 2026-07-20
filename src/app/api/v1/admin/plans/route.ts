import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

/**
 * Edit the plans Operyx sells.
 *
 * Pricing moves fastest in the first year, and a price change should not require a developer and a
 * deploy. Prices are entered in rupees here and stored in paise - the UI should never have to
 * think in paise, and the database should never store a float.
 *
 * Existing subscriptions are deliberately unaffected by a price change. A salon that agreed
 * ₹1,999 keeps paying ₹1,999 until someone changes their subscription explicitly; silently
 * repricing live customers because a list price moved would be indefensible.
 */

const schema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),

  monthlyPriceRupees: z.number().min(0).max(1_000_000),
  annualPriceRupees: z.number().min(0).max(10_000_000),
  setupFeeRupees: z.number().min(0).max(1_000_000).default(0),
  trialDays: z.number().int().min(0).max(365).default(0),

  /// Zero means unlimited on every limit.
  maxBranches: z.number().int().min(0).max(10_000),
  maxStaff: z.number().int().min(0).max(100_000),
  maxServices: z.number().int().min(0).max(100_000),
  maxMonthlyAppointments: z.number().int().min(0).max(10_000_000),
  maxStorageMb: z.number().int().min(0).max(10_000_000),

  features: z.array(z.string().trim().min(1).max(40)).default([]),
  isPublic: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export async function GET() {
  try {
    await requirePlatformAdmin();
    const plans = await db.subscriptionPlan.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { tenantSubscriptions: true } } },
    });
    return Response.json({ data: { plans } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid plan", 400, parsed.error.flatten());
    const { id, monthlyPriceRupees, annualPriceRupees, setupFeeRupees, ...rest } = parsed.data;

    const data = {
      ...rest,
      monthlyPricePaise: Math.round(monthlyPriceRupees * 100),
      annualPricePaise: Math.round(annualPriceRupees * 100),
      setupFeePaise: Math.round(setupFeeRupees * 100),
    };

    const plan = id
      ? await db.subscriptionPlan.update({ where: { id }, data })
      : await db.subscriptionPlan.create({ data });

    await db.auditLog.create({
      data: {
        userId: admin.user.id,
        tenantId: null,
        action: id ? "PLAN_UPDATED" : "PLAN_CREATED",
        entity: "SubscriptionPlan",
        entityId: plan.id,
        metadata: { code: plan.code, monthlyPricePaise: plan.monthlyPricePaise, annualPricePaise: plan.annualPricePaise },
      },
    });

    return Response.json({ data: plan }, { status: id ? 200 : 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
