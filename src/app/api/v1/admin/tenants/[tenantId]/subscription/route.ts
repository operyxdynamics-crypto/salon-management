import { z } from "zod";
import { cycleCharge, isUnlimited } from "@/lib/billing-plans";
import { classifyChange } from "@/lib/subscription-events";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

/**
 * Run a salon's subscription: start a trial, convert it, change the plan, agree a different price,
 * suspend for non-payment, or cancel.
 *
 * This is what makes it possible to sell before any payment gateway exists. An admin can put a
 * salon on Group annual at a negotiated rate, mark it active when the bank transfer lands, and the
 * product enforces the right limits from that moment. Razorpay later automates the collection; it
 * does not change any of this.
 */

const schema = z.object({
  planId: z.string().min(1).optional(),
  billingPeriod: z.enum(["MONTHLY", "ANNUAL"]).optional(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]).optional(),
  /// Extend or start a trial, in days from now.
  trialDays: z.number().int().min(0).max(365).optional(),
  /// What was actually agreed, in rupees. Null clears it and reverts to list price.
  agreedPriceRupees: z.number().min(0).max(10_000_000).nullable().optional(),
  /// When the paid-for period ends - set this when a bank transfer is received.
  currentPeriodEnd: z.iso.datetime().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid subscription change", 400, parsed.error.flatten());
    const { tenantId } = await params;

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscriptionRecord: { include: { plan: true } },
        _count: { select: { branches: true, services: true } },
        users: { where: { role: { not: "CUSTOMER" }, isActive: true }, select: { id: true } },
      },
    });
    if (!tenant) throw new PlatformError("NOT_FOUND", "Salon not found", 404);

    const plan = parsed.data.planId
      ? await db.subscriptionPlan.findFirst({ where: { id: parsed.data.planId, isActive: true } })
      : tenant.subscriptionRecord?.plan ?? null;
    if (!plan) throw new PlatformError("NOT_FOUND", "Subscription plan not found", 404);

    // Refuse a downgrade that would strand the salon over its new limits. Unlimited is stored as 0,
    // so it must never be read as a ceiling of zero - that would block every upgrade to Franchise.
    if (parsed.data.planId) {
      const usage = { branches: tenant._count.branches, services: tenant._count.services, staff: tenant.users.length };
      const breaches = ([
        ["branches", usage.branches, plan.maxBranches],
        ["services", usage.services, plan.maxServices],
        ["team members", usage.staff, plan.maxStaff],
      ] as const).filter(([, used, limit]) => !isUnlimited(limit) && used > limit);
      if (breaches.length) {
        const detail = breaches.map(([what, used, limit]) => `${used} ${what} against a limit of ${limit}`).join(", ");
        throw new PlatformError("LIMIT_EXCEEDED", `This salon is already using ${detail}. Reduce usage or pick a larger plan.`, 409, { usage });
      }
    }

    const now = new Date();
    const trialEndsAt = parsed.data.trialDays === undefined
      ? undefined
      : parsed.data.trialDays > 0
        ? new Date(now.getTime() + parsed.data.trialDays * 86_400_000)
        : null;

    // Snapshot before the change, so the event log can say what actually moved. Without this the
    // history is just a list of new states and nobody can tell an upgrade from a downgrade.
    const before = tenant.subscriptionRecord?.plan ? {
      status: tenant.subscriptionRecord.status,
      billingPeriod: tenant.subscriptionRecord.billingPeriod,
      agreedPricePaise: tenant.subscriptionRecord.agreedPricePaise,
      planCode: tenant.subscriptionRecord.plan.code,
      plan: { monthlyPricePaise: tenant.subscriptionRecord.plan.monthlyPricePaise, annualPricePaise: tenant.subscriptionRecord.plan.annualPricePaise },
    } : null;

    const subscription = await db.$transaction(async (tx) => {
      const record = await tx.tenantSubscription.upsert({
        where: { tenantId },
        update: {
          planId: plan.id,
          ...(parsed.data.billingPeriod ? { billingPeriod: parsed.data.billingPeriod } : {}),
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
          ...(parsed.data.agreedPriceRupees !== undefined ? { agreedPricePaise: parsed.data.agreedPriceRupees === null ? null : Math.round(parsed.data.agreedPriceRupees * 100) } : {}),
          ...(parsed.data.currentPeriodEnd !== undefined ? { currentPeriodEnd: parsed.data.currentPeriodEnd ? new Date(parsed.data.currentPeriodEnd) : null } : {}),
          // Clearing PAST_DUE has to clear the clock too, or the grace period keeps counting from
          // the original failure and the salon is suspended despite having paid.
          ...(parsed.data.status && parsed.data.status !== "PAST_DUE" ? { pastDueSince: null } : {}),
          ...(parsed.data.status === "PAST_DUE" ? { pastDueSince: tenant.subscriptionRecord?.pastDueSince ?? now } : {}),
          assignedBy: admin.user.id,
          notes: parsed.data.note ?? tenant.subscriptionRecord?.notes,
        },
        create: {
          tenantId,
          planId: plan.id,
          billingPeriod: parsed.data.billingPeriod ?? "MONTHLY",
          status: parsed.data.status ?? (plan.trialDays > 0 ? "TRIALING" : "ACTIVE"),
          trialEndsAt: trialEndsAt ?? (plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * 86_400_000) : null),
          agreedPricePaise: parsed.data.agreedPriceRupees != null ? Math.round(parsed.data.agreedPriceRupees * 100) : null,
          assignedBy: admin.user.id,
          notes: parsed.data.note,
        },
        include: { plan: true },
      });

      // Keep the denormalised code on Tenant in step; older code still reads it.
      await tx.tenant.update({ where: { id: tenantId }, data: { subscription: plan.code } });

      /**
       * The history. Written in the same transaction as the change, so the log can never disagree
       * with the state - a subscription that moved without an event, or an event for a change that
       * rolled back, would both be worse than no log at all.
       */
      const classified = classifyChange(before, {
        status: record.status,
        billingPeriod: record.billingPeriod,
        agreedPricePaise: record.agreedPricePaise,
        planCode: plan.code,
        plan: { monthlyPricePaise: plan.monthlyPricePaise, annualPricePaise: plan.annualPricePaise },
      });

      await tx.subscriptionEvent.create({
        data: {
          tenantId,
          kind: classified.kind,
          fromValuePaise: classified.fromValuePaise,
          toValuePaise: classified.toValuePaise,
          fromPlanCode: classified.fromPlanCode,
          toPlanCode: classified.toPlanCode,
          billingPeriod: record.billingPeriod,
          reason: parsed.data.note ?? null,
          actorUserId: admin.user.id,
        },
      });

      // Stamp the cancellation date so churn can be counted by month. Cleared on reactivation, or
      // a returning customer would keep appearing in the month they once left.
      if (classified.kind === "CANCELLED") {
        await tx.tenantSubscription.update({ where: { tenantId }, data: { cancelledAt: new Date(), cancelReason: parsed.data.note ?? null } });
      } else if (classified.kind === "REACTIVATED") {
        await tx.tenantSubscription.update({ where: { tenantId }, data: { cancelledAt: null, cancelReason: null } });
      }

      await tx.auditLog.create({
        data: {
          userId: admin.user.id,
          tenantId,
          action: "SUBSCRIPTION_UPDATED",
          entity: "TenantSubscription",
          entityId: record.id,
          metadata: {
            planCode: plan.code,
            status: record.status,
            billingPeriod: record.billingPeriod,
            agreedPricePaise: record.agreedPricePaise,
            note: parsed.data.note ?? null,
          },
        },
      });
      return record;
    });

    // What the next invoice would be, so the admin can quote it without doing sums by hand.
    const charge = cycleCharge(
      {
        monthlyPricePaise: subscription.agreedPricePaise ?? subscription.plan.monthlyPricePaise,
        annualPricePaise: subscription.agreedPricePaise ?? subscription.plan.annualPricePaise,
        setupFeePaise: subscription.plan.setupFeePaise,
      },
      subscription.billingPeriod,
      !subscription.currentPeriodEnd,
    );

    return Response.json({ data: { subscription, charge } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
