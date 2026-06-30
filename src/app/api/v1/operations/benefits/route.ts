import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("MEMBERSHIP"),
    branchId: z.string().min(1),
    name: z.string().trim().min(2).max(100),
    price: z.number().nonnegative(),
    durationDays: z.number().int().positive().max(3650),
    benefits: z.string().trim().min(2).max(2000),
    discountPercent: z.number().min(0).max(100).default(0),
    rewardMultiplier: z.number().min(0).max(20).default(1),
  }),
  z.object({
    kind: z.literal("PACKAGE"),
    branchId: z.string().min(1),
    name: z.string().trim().min(2).max(100),
    price: z.number().nonnegative(),
    validityDays: z.number().int().positive().max(3650),
    services: z.array(z.object({ serviceId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  }),
  z.object({
    kind: z.literal("GIFT_CARD"),
    branchId: z.string().min(1),
    customerId: z.string().optional(),
    value: z.number().positive(),
    expiresAt: z.iso.datetime().optional(),
    idempotencyKey: z.string().min(12).max(120),
  }),
  z.object({
    kind: z.literal("REWARD_RULE"),
    branchId: z.string().min(1),
    name: z.string().trim().min(2).max(100),
    pointsPerAmount: z.number().min(0).max(100),
    amountPerPoint: z.number().positive().max(1000),
    earnOnTax: z.boolean().default(false),
    minRedeemPoints: z.number().int().min(0).max(100000).default(0),
    maxRedeemPercent: z.number().min(0).max(100).default(20),
    expiryDays: z.number().int().positive().max(3650).optional(),
  }),
  z.object({
    kind: z.literal("WALLET_ADJUSTMENT"),
    branchId: z.string().min(1),
    customerId: z.string().min(1),
    direction: z.enum(["CREDIT", "DEBIT"]),
    amount: z.number().positive(),
    reason: z.string().trim().min(3).max(300),
    idempotencyKey: z.string().min(12).max(120),
  }),
  z.object({
    kind: z.literal("PURCHASE_MEMBERSHIP"),
    branchId: z.string().min(1),
    customerId: z.string().min(1),
    membershipId: z.string().min(1),
    startsAt: z.iso.datetime().optional(),
    idempotencyKey: z.string().min(12).max(120),
  }),
  z.object({
    kind: z.literal("PURCHASE_PACKAGE"),
    branchId: z.string().min(1),
    customerId: z.string().min(1),
    packageId: z.string().min(1),
    startsAt: z.iso.datetime().optional(),
    idempotencyKey: z.string().min(12).max(120),
  }),
]);

const patchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MEMBERSHIP"), branchId: z.string().min(1), id: z.string().min(1), isActive: z.boolean() }),
  z.object({ kind: z.literal("PACKAGE"), branchId: z.string().min(1), id: z.string().min(1), isActive: z.boolean() }),
  z.object({ kind: z.literal("GIFT_CARD"), branchId: z.string().min(1), id: z.string().min(1), status: z.enum(["ACTIVE", "CANCELLED"]) }),
  z.object({ kind: z.literal("REWARD_RULE"), branchId: z.string().min(1), id: z.string().min(1), isActive: z.boolean() }),
]);

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid benefit", 400, parsed.error.flatten());
    const payload = parsed.data;
    const context = await requireOperationsContext("sale:write", { branchId: payload.branchId, requireBranch: true });

    if (payload.kind === "MEMBERSHIP") {
      const item = await db.membership.create({
        data: {
          tenantId: context.tenant.id,
          name: payload.name,
          price: payload.price,
          durationDays: payload.durationDays,
          benefits: { description: payload.benefits },
          discountPercent: payload.discountPercent,
          rewardMultiplier: payload.rewardMultiplier,
        },
      });
      return Response.json({ data: item }, { status: 201 });
    }

    if (payload.kind === "PACKAGE") {
      const serviceIds = payload.services.map((item) => item.serviceId);
      const validServices = await db.service.count({ where: { id: { in: serviceIds }, tenantId: context.tenant.id } });
      if (validServices !== new Set(serviceIds).size) throw new OperationsError("NOT_FOUND", "One or more services were not found", 404);
      const item = await db.package.create({
        data: { tenantId: context.tenant.id, name: payload.name, price: payload.price, validityDays: payload.validityDays, services: payload.services },
      });
      return Response.json({ data: item }, { status: 201 });
    }

    if (payload.kind === "GIFT_CARD") {
      const customer = payload.customerId
        ? await db.customer.findFirst({ where: { id: payload.customerId, tenantId: context.tenant.id } })
        : null;
      if (payload.customerId && !customer) throw new OperationsError("NOT_FOUND", "Customer not found", 404);
      const existing = await db.benefitTransaction.findUnique({ where: { idempotencyKey: payload.idempotencyKey } });
      if (existing) return Response.json({ data: existing });
      const code = `NEEL-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
      const card = await db.$transaction(async (tx) => {
        const created = await tx.giftCard.create({
          data: {
            tenantId: context.tenant.id,
            branchId: context.branch!.id,
            customerId: customer?.id,
            code,
            initialValue: payload.value,
            balance: payload.value,
            expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
          },
        });
        await tx.benefitTransaction.create({
          data: { tenantId: context.tenant.id, branchId: context.branch!.id, customerId: customer?.id, kind: "GIFT_CARD_ISSUE", sourceType: "GIFT_CARD", sourceId: created.id, amount: payload.value, idempotencyKey: payload.idempotencyKey },
        });
        await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "GIFT_CARD_ISSUED", entity: "GiftCard", entityId: created.id, metadata: { value: payload.value } } });
        return created;
      });
      return Response.json({ data: card }, { status: 201 });
    }

    if (payload.kind === "REWARD_RULE") {
      const rule = await db.$transaction(async (tx) => {
        await tx.rewardRule.updateMany({ where: { tenantId: context.tenant.id, isActive: true }, data: { isActive: false } });
        const created = await tx.rewardRule.create({
          data: {
            tenantId: context.tenant.id,
            name: payload.name,
            pointsPerAmount: payload.pointsPerAmount,
            amountPerPoint: payload.amountPerPoint,
            earnOnTax: payload.earnOnTax,
            minRedeemPoints: payload.minRedeemPoints,
            maxRedeemPercent: payload.maxRedeemPercent,
            expiryDays: payload.expiryDays,
          },
        });
        await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "REWARD_RULE_UPDATED", entity: "RewardRule", entityId: created.id, metadata: { branchId: context.branch!.id } } });
        return created;
      });
      return Response.json({ data: rule }, { status: 201 });
    }

    if (payload.kind === "WALLET_ADJUSTMENT") {
      const customer = await db.customer.findFirst({ where: { id: payload.customerId, tenantId: context.tenant.id } });
      if (!customer) throw new OperationsError("NOT_FOUND", "Customer not found", 404);
      const existing = await db.benefitTransaction.findUnique({ where: { idempotencyKey: payload.idempotencyKey } });
      if (existing) return Response.json({ data: existing });
      const signedAmount = payload.direction === "CREDIT" ? payload.amount : -payload.amount;
      const transaction = await db.$transaction(async (tx) => {
        if (payload.direction === "DEBIT") {
          const changed = await tx.customer.updateMany({ where: { id: customer.id, walletBalance: { gte: payload.amount } }, data: { walletBalance: { decrement: payload.amount } } });
          if (changed.count !== 1) throw new OperationsError("VALIDATION", "Wallet balance is insufficient", 400);
        } else {
          await tx.customer.update({ where: { id: customer.id }, data: { walletBalance: { increment: payload.amount } } });
        }
        const created = await tx.benefitTransaction.create({
          data: { tenantId: context.tenant.id, branchId: context.branch!.id, customerId: customer.id, kind: `WALLET_${payload.direction}`, sourceType: "MANUAL", amount: signedAmount, note: payload.reason, idempotencyKey: payload.idempotencyKey },
        });
        await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "CUSTOMER_WALLET_ADJUSTED", entity: "Customer", entityId: customer.id, metadata: { amount: signedAmount, reason: payload.reason } } });
        return created;
      });
      return Response.json({ data: transaction }, { status: 201 });
    }

    if (payload.kind === "PURCHASE_MEMBERSHIP") {
      const [customer, membership] = await Promise.all([
        db.customer.findFirst({ where: { id: payload.customerId, tenantId: context.tenant.id } }),
        db.membership.findFirst({ where: { id: payload.membershipId, tenantId: context.tenant.id, isActive: true } }),
      ]);
      if (!customer || !membership) throw new OperationsError("NOT_FOUND", "Customer or membership not found", 404);
      const existing = await db.benefitTransaction.findUnique({ where: { idempotencyKey: payload.idempotencyKey } });
      if (existing) return Response.json({ data: existing });
      const startsAt = payload.startsAt ? new Date(payload.startsAt) : new Date();
      const endsAt = new Date(startsAt.getTime() + membership.durationDays * 86_400_000);
      const purchase = await db.$transaction(async (tx) => {
        const created = await tx.customerMembership.create({ data: { customerId: customer.id, membershipId: membership.id, startsAt, endsAt } });
        await tx.benefitTransaction.create({ data: { tenantId: context.tenant.id, branchId: context.branch!.id, customerId: customer.id, kind: "MEMBERSHIP_ASSIGNED", sourceType: "MEMBERSHIP", sourceId: membership.id, amount: membership.price, idempotencyKey: payload.idempotencyKey } });
        await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "CUSTOMER_MEMBERSHIP_ASSIGNED", entity: "CustomerMembership", entityId: created.id, metadata: { customerId: customer.id, membershipId: membership.id } } });
        return created;
      });
      return Response.json({ data: purchase }, { status: 201 });
    }

    const [customer, pack] = await Promise.all([
      db.customer.findFirst({ where: { id: payload.customerId, tenantId: context.tenant.id } }),
      db.package.findFirst({ where: { id: payload.packageId, tenantId: context.tenant.id, isActive: true } }),
    ]);
    if (!customer || !pack) throw new OperationsError("NOT_FOUND", "Customer or package not found", 404);
    const existing = await db.benefitTransaction.findUnique({ where: { idempotencyKey: payload.idempotencyKey } });
    if (existing) return Response.json({ data: existing });
    const startsAt = payload.startsAt ? new Date(payload.startsAt) : new Date();
    const expiresAt = new Date(startsAt.getTime() + pack.validityDays * 86_400_000);
    const purchase = await db.$transaction(async (tx) => {
      const created = await tx.packagePurchase.create({ data: { customerId: customer.id, packageId: pack.id, balance: pack.services as never, expiresAt } });
      await tx.benefitTransaction.create({ data: { tenantId: context.tenant.id, branchId: context.branch!.id, customerId: customer.id, kind: "PACKAGE_ASSIGNED", sourceType: "PACKAGE", sourceId: pack.id, amount: pack.price, idempotencyKey: payload.idempotencyKey } });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "CUSTOMER_PACKAGE_ASSIGNED", entity: "PackagePurchase", entityId: created.id, metadata: { customerId: customer.id, packageId: pack.id } } });
      return created;
    });
    return Response.json({ data: purchase }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid benefit update", 400, parsed.error.flatten());
    const payload = parsed.data;
    const context = await requireOperationsContext("sale:write", { branchId: payload.branchId, requireBranch: true });
    const updated = await db.$transaction(async (tx) => {
      if (payload.kind === "MEMBERSHIP") {
        const item = await tx.membership.findFirst({ where: { id: payload.id, tenantId: context.tenant.id } });
        if (!item) throw new OperationsError("NOT_FOUND", "Membership not found", 404);
        const record = await tx.membership.update({ where: { id: payload.id }, data: { isActive: payload.isActive } });
        await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: payload.isActive ? "MEMBERSHIP_RESTORED" : "MEMBERSHIP_ARCHIVED", entity: "Membership", entityId: payload.id, metadata: { branchId: context.branch!.id } } });
        return record;
      }
      if (payload.kind === "PACKAGE") {
        const item = await tx.package.findFirst({ where: { id: payload.id, tenantId: context.tenant.id } });
        if (!item) throw new OperationsError("NOT_FOUND", "Package not found", 404);
        const record = await tx.package.update({ where: { id: payload.id }, data: { isActive: payload.isActive } });
        await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: payload.isActive ? "PACKAGE_RESTORED" : "PACKAGE_ARCHIVED", entity: "Package", entityId: payload.id, metadata: { branchId: context.branch!.id } } });
        return record;
      }
      if (payload.kind === "GIFT_CARD") {
        const item = await tx.giftCard.findFirst({ where: { id: payload.id, tenantId: context.tenant.id } });
        if (!item) throw new OperationsError("NOT_FOUND", "Gift card not found", 404);
        const record = await tx.giftCard.update({ where: { id: payload.id }, data: { status: payload.status } });
        await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: payload.status === "ACTIVE" ? "GIFT_CARD_RESTORED" : "GIFT_CARD_CANCELLED", entity: "GiftCard", entityId: payload.id, metadata: { branchId: context.branch!.id } } });
        return record;
      }
      const item = await tx.rewardRule.findFirst({ where: { id: payload.id, tenantId: context.tenant.id } });
      if (!item) throw new OperationsError("NOT_FOUND", "Reward rule not found", 404);
      if (payload.isActive) await tx.rewardRule.updateMany({ where: { tenantId: context.tenant.id, isActive: true, NOT: { id: payload.id } }, data: { isActive: false } });
      const record = await tx.rewardRule.update({ where: { id: payload.id }, data: { isActive: payload.isActive } });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: payload.isActive ? "REWARD_RULE_ACTIVATED" : "REWARD_RULE_ARCHIVED", entity: "RewardRule", entityId: payload.id, metadata: { branchId: context.branch!.id } } });
      return record;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
