import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin, requestIp } from "@/lib/platform-auth";

/**
 * Turn a won lead into a trialling salon, in one step.
 *
 * Everything already on the lead is reused: the name, the city, the plan that was quoted and the
 * add-ons that were quoted with it. Retyping it into a separate Create Salon form is not just slow -
 * it is where the quote and the subscription drift apart, and nobody notices until the first
 * invoice is wrong.
 *
 * What this creates is a **trial**, not a customer. It shows up under Trials, contributes nothing to
 * MRR, and only becomes a customer when someone marks it paid. Selling and getting paid are two
 * different events and the numbers depend on not confusing them.
 */

const schema = z.object({
  leadId: z.string().min(1),
  ownerName: z.string().trim().min(2).max(100),
  ownerEmail: z.email(),
  /** Defaults to the plan's own trial length. Overridable, because deals get negotiated. */
  trialDays: z.number().int().min(0).max(90).optional(),
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

type StoredQuoteLine = { code: string; quantity: number };

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid conversion", 400, parsed.error.flatten());
    const { leadId, ownerName, ownerEmail } = parsed.data;

    const lead = await db.lead.findUnique({ where: { id: leadId }, include: { interestedPlan: true } });
    if (!lead) throw new PlatformError("NOT_FOUND", "That lead no longer exists", 404);
    // Converting twice would create a second salon for the same customer and split their history.
    if (lead.convertedTenantId) throw new PlatformError("CONFLICT", "This lead has already been converted", 409);

    const existingOwner = await db.user.findUnique({ where: { email: ownerEmail } });
    if (existingOwner) throw new PlatformError("CONFLICT", "An account already exists for this owner email", 409);

    const plan = lead.interestedPlan?.isActive
      ? lead.interestedPlan
      // No plan quoted, or the quoted one has been retired: fall back to the cheapest public plan
      // rather than a hardcoded code, so repricing the range never breaks onboarding.
      : await db.subscriptionPlan.findFirst({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } });
    if (!plan) throw new PlatformError("NOT_FOUND", "No plan available to start a trial on", 404);

    /**
     * The add-ons from the saved quote, matched by code.
     *
     * Only the quantity is carried across. The price comes from the AddOn record at billing time,
     * which is the same rule that protects base plans - and it means a pack retired since the quote
     * simply drops out rather than resurrecting a product we no longer sell.
     */
    const quoted: StoredQuoteLine[] = Array.isArray(lead.quotedAddOns) ? (lead.quotedAddOns as unknown as StoredQuoteLine[]) : [];
    const addOnRecords = quoted.length
      ? await db.addOn.findMany({ where: { code: { in: quoted.map((line) => line.code) }, isActive: true } })
      : [];

    const baseSlug = slugify(lead.salonName) || "salon";
    const taken = await db.tenant.findUnique({ where: { slug: baseSlug } });
    const slug = taken ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const trialDays = parsed.data.trialDays ?? plan.trialDays;
    const trialEndsAt = trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000) : null;

    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: lead.salonName, slug, status: "DRAFT", onboardingStep: 1, subscription: plan.code },
      });

      const city = lead.city?.trim() || "Main";
      await tx.branch.create({
        data: {
          tenantId: tenant.id, name: `${tenant.name} - ${city}`, slug: slugify(city) || "main",
          address: "", city, state: "", postalCode: "", phone: lead.phone,
        },
      });

      const subscription = await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id, planId: plan.id, status: "TRIALING", trialEndsAt,
          assignedBy: admin.user.id,
          notes: lead.quotedMonthlyPaise !== null ? `Quoted ₹${(lead.quotedMonthlyPaise / 100).toLocaleString("en-IN")}/mo before GST.` : null,
          addOns: {
            create: addOnRecords.map((record) => ({
              addOnId: record.id,
              quantity: quoted.find((line) => line.code === record.code)?.quantity ?? 1,
            })),
          },
        },
      });

      /**
       * The event log entry, written now rather than when they pay.
       *
       * A trial that never converts is still a fact worth having: the log is what makes conversion
       * rate and retention computable at all, and it can only be complete if every start is in it.
       */
      await tx.subscriptionEvent.create({
        data: {
          tenantId: tenant.id,
          kind: "TRIAL_STARTED",
          // A trial is worth nothing per month, and saying so here keeps MRR honest by construction.
          fromValuePaise: null,
          toValuePaise: 0,
          toPlanCode: plan.code,
          reason: lead.source ? `Converted from lead (${lead.source})` : "Converted from lead",
          actorUserId: admin.user.id,
        },
      });

      const invitation = await tx.ownerInvitation.create({
        data: { tenantId: tenant.id, email: ownerEmail, tokenHash, invitedById: admin.user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
      });

      await tx.adminNote.create({
        data: {
          tenantId: tenant.id, authorId: admin.user.id,
          note: [
            `Converted from lead. Contact: ${lead.contactName} (${lead.phone}). Owner: ${ownerName}.`,
            lead.source ? `Source: ${lead.source}.` : null,
            lead.notes,
          ].filter(Boolean).join(" "),
        },
      });

      // The lead stays in the record and leaves the pipeline. Deleting it would lose where this
      // customer came from, which is the only way to tell which channels are worth the money.
      await tx.lead.update({
        where: { id: lead.id },
        data: { convertedTenantId: tenant.id, convertedAt: new Date(), status: "WON" },
      });

      await tx.auditLog.create({
        data: {
          userId: admin.user.id, tenantId: tenant.id, action: "LEAD_CONVERTED_TO_TRIAL",
          entity: "Tenant", entityId: tenant.id, ipAddress: requestIp(request),
          metadata: { leadId: lead.id, plan: plan.code, trialDays, addOns: addOnRecords.map((record) => record.code) },
        },
      });

      return { tenant, invitation, subscription };
    });

    return Response.json({
      data: {
        tenantId: result.tenant.id,
        invitationId: result.invitation.id,
        // Shown once and never stored in plain text. We never know a salon's password.
        invitationUrl: `/onboarding/invitation?token=${token}`,
        trialEndsAt,
      },
    }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
