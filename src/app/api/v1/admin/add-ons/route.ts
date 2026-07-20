import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

/**
 * The add-on catalogue.
 *
 * Editable without a deploy, for the same reason plans are: early pricing moves, and a company that
 * has to ship code to try ₹600 instead of ₹500 will simply never try it.
 *
 * Changing a price here affects new sales only. Existing subscriptions store a quantity and read
 * the price at billing time, so a change does re-price them at their next renewal - which is why
 * this endpoint refuses to change `limitField` on an add-on people have already bought. Quietly
 * turning someone's appointment pack into a branch pack would be indefensible.
 */

const LIMIT_FIELDS = ["maxBranches", "maxStaff", "maxServices", "maxMonthlyAppointments"] as const;

const schema = z.object({
  id: z.string().optional(),
  code: z.string().trim().regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and underscores only").min(2).max(40),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  limitField: z.enum(LIMIT_FIELDS).nullable().optional(),
  unitAmount: z.number().int().min(1).max(1_000_000),
  unitPriceRupees: z.number().min(0).max(1_000_000),
  isMetered: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid add-on", 400, parsed.error.flatten());
    const { id, unitPriceRupees, limitField, ...rest } = parsed.data;

    const data = {
      ...rest,
      limitField: limitField ?? null,
      // Rupees on the wire, paise in the database. Money is never a float here.
      unitPricePaise: Math.round(unitPriceRupees * 100),
    };

    if (!id) {
      const created = await db.addOn.create({ data });
      return Response.json({ data: created }, { status: 201 });
    }

    const existing = await db.addOn.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!existing) throw new PlatformError("NOT_FOUND", "That add-on no longer exists", 404);

    // What it extends is the one thing that cannot move once someone owns it.
    if (existing._count.subscriptions > 0 && existing.limitField !== data.limitField) {
      throw new PlatformError(
        "CONFLICT",
        `${existing._count.subscriptions} subscription(s) already have this add-on, so what it extends cannot change. Create a new add-on instead.`,
        409,
      );
    }

    const updated = await db.addOn.update({ where: { id }, data });
    return Response.json({ data: updated });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
