import { z } from "zod";
import { db } from "@/lib/db";
import { buildQuote, type AddOnLine, type PlanLimits } from "@/lib/packages";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

/**
 * Save the quote a salesperson actually gave.
 *
 * The client sends which plan and how many of each pack. It never sends a price. Every rupee is
 * recomputed here from the AddOn and SubscriptionPlan records, because a total that arrives from a
 * browser is a total someone could have edited, and this number ends up in front of a customer.
 *
 * The result is then frozen onto the lead. A quote is a promise made on a particular day: if a pack
 * price changes next month, what this salon was told must not change with it.
 */

const schema = z.object({
  leadId: z.string().min(1),
  planId: z.string().min(1),
  addOns: z.array(z.object({
    code: z.string().min(1),
    quantity: z.number().int().min(0).max(999),
  })).max(20).default([]),
});

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid quote", 400, parsed.error.flatten());
    const { leadId, planId, addOns } = parsed.data;

    const wanted = addOns.filter((line) => line.quantity > 0);

    const [plan, records] = await Promise.all([
      db.subscriptionPlan.findUnique({ where: { id: planId } }),
      wanted.length
        ? db.addOn.findMany({ where: { code: { in: wanted.map((line) => line.code) }, isActive: true } })
        : Promise.resolve([]),
    ]);
    if (!plan) throw new PlatformError("NOT_FOUND", "That plan no longer exists", 404);

    const missing = wanted.filter((line) => !records.some((record) => record.code === line.code));
    if (missing.length) {
      throw new PlatformError("VALIDATION", `No such add-on: ${missing.map((line) => line.code).join(", ")}`, 400);
    }

    const lines: AddOnLine[] = records.map((record) => ({
      code: record.code,
      name: record.name,
      limitField: (record.limitField as keyof PlanLimits | null) ?? null,
      unitAmount: record.unitAmount,
      unitPricePaise: record.unitPricePaise,
      quantity: wanted.find((line) => line.code === record.code)!.quantity,
      isMetered: record.isMetered,
    }));

    const quote = buildQuote(plan, lines);

    const lead = await db.lead.update({
      where: { id: leadId },
      data: {
        interestedPlanId: plan.id,
        // Stored with the prices of today, so the quote can be read back exactly as it was given.
        quotedAddOns: lines.map((line) => ({
          code: line.code, name: line.name, quantity: line.quantity,
          unitAmount: line.unitAmount, unitPricePaise: line.unitPricePaise,
        })),
        quotedMonthlyPaise: quote.netMonthlyPaise,
        quotedAt: new Date(),
        // Quoting is a stage, not a note. Moving it here means nobody has to remember to.
        status: "QUOTED",
      },
    });

    return Response.json({ data: { lead, quote } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
