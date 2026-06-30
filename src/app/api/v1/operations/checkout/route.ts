import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  appointmentId: z.string().optional(),
  taxMode: z.enum(["GST", "NON_GST"]).default("GST"),
  lines: z.array(z.object({
    type: z.enum(["SERVICE", "PRODUCT"]),
    itemId: z.string().min(1),
    staffId: z.string().optional(),
    packagePurchaseId: z.string().optional(),
    quantity: z.number().positive(),
    discount: z.number().min(0).default(0),
  })).min(1),
  payments: z.array(z.object({
    method: z.enum(["CASH", "CARD", "UPI", "GIFT_CARD", "LOYALTY", "WALLET"]),
    amount: z.number().positive(),
    reference: z.string().max(100).optional(),
  })),
  tip: z.number().min(0).default(0),
  idempotencyKey: z.string().min(12).max(120),
});

function financialYear(date = new Date()) {
  const india = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const year = india.getFullYear();
  const start = india.getMonth() >= 3 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

type PackageBalanceLine = { serviceId: string; quantity: number };

function packageBalanceLines(value: unknown): PackageBalanceLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as { serviceId?: unknown; quantity?: unknown };
      return typeof candidate.serviceId === "string"
        ? { serviceId: candidate.serviceId, quantity: Number(candidate.quantity ?? 0) }
        : null;
    })
    .filter((item): item is PackageBalanceLine => Boolean(item));
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid checkout", 400, parsed.error.flatten());
    const context = await requireOperationsContext("sale:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const existing = await db.invoice.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey }, include: { lines: true, payments: true } });
    if (existing) return Response.json({ data: existing });

    const customer = await db.customer.findFirst({ where: { id: parsed.data.customerId, tenantId: context.tenant.id } });
    if (!customer) throw new OperationsError("NOT_FOUND", "Customer not found", 404);
    const appointment = parsed.data.appointmentId
      ? await db.appointment.findFirst({ where: { id: parsed.data.appointmentId, branchId: branch.id, customerId: customer.id } })
      : null;
    if (parsed.data.appointmentId && !appointment) throw new OperationsError("NOT_FOUND", "Appointment not found", 404);

    const serviceIds = parsed.data.lines.filter((line) => line.type === "SERVICE").map((line) => line.itemId);
    const productIds = parsed.data.lines.filter((line) => line.type === "PRODUCT").map((line) => line.itemId);
    const packagePurchaseIds = parsed.data.lines.flatMap((line) => line.packagePurchaseId ? [line.packagePurchaseId] : []);
    const [services, products, staff, packagePurchases, rewardRule] = await Promise.all([
      db.service.findMany({
        where: { id: { in: serviceIds }, tenantId: context.tenant.id, isActive: true },
        include: { consumptionRecipes: { where: { isActive: true }, include: { inventoryItem: { include: { branchStock: { where: { branchId: branch.id } } } } } } },
      }),
      db.inventoryItem.findMany({ where: { id: { in: productIds }, tenantId: context.tenant.id }, include: { branchStock: { where: { branchId: branch.id } } } }),
      db.staff.findMany({ where: { id: { in: parsed.data.lines.flatMap((line) => line.staffId ? [line.staffId] : []) }, branch: { tenantId: context.tenant.id }, OR: [{ branchId: branch.id }, { branchAssignments: { some: { branchId: branch.id } } }] } }),
      db.packagePurchase.findMany({ where: { id: { in: packagePurchaseIds }, customerId: customer.id, status: "ACTIVE", expiresAt: { gte: new Date() } }, include: { package: true } }),
      db.rewardRule.findFirst({ where: { tenantId: context.tenant.id, isActive: true }, orderBy: { createdAt: "desc" } }),
    ]);
    if (services.length !== new Set(serviceIds).size || products.length !== new Set(productIds).size) {
      throw new OperationsError("NOT_FOUND", "One or more sale items were not found", 404);
    }

    const serviceMap = new Map(services.map((service) => [service.id, service]));
    const productMap = new Map(products.map((product) => [product.id, product]));
    const staffMap = new Map(staff.map((member) => [member.id, member]));
    const packageMap = new Map(packagePurchases.map((purchase) => [purchase.id, purchase]));
    if (packagePurchases.length !== new Set(packagePurchaseIds).size) {
      throw new OperationsError("VALIDATION", "One or more packages are invalid, expired, or inactive", 400);
    }
    const calculated = parsed.data.lines.map((line) => {
      const service = line.type === "SERVICE" ? serviceMap.get(line.itemId) : undefined;
      const product = line.type === "PRODUCT" ? productMap.get(line.itemId) : undefined;
      if (line.packagePurchaseId && line.type !== "SERVICE") throw new OperationsError("VALIDATION", "Packages can only redeem service lines", 400);
      if (line.packagePurchaseId) {
        const purchase = packageMap.get(line.packagePurchaseId);
        const balance = packageBalanceLines(purchase?.balance);
        const matched = balance.find((item) => item.serviceId === line.itemId);
        if (!matched || matched.quantity < line.quantity) {
          throw new OperationsError("VALIDATION", `${service?.name ?? "Selected service"} is not available in this package balance`, 400);
        }
      }
      const unitPrice = Number(service?.price ?? product?.retailPrice ?? 0);
      const taxRate = parsed.data.taxMode === "GST" ? Number(service?.taxRate ?? 18) : 0;
      const base = unitPrice * line.quantity;
      const effectiveDiscount = line.packagePurchaseId ? base : line.discount;
      if (effectiveDiscount > base) throw new OperationsError("VALIDATION", "Discount cannot exceed line value", 400);
      const taxable = base - effectiveDiscount;
      const tax = Number((taxable * taxRate / 100).toFixed(2));
      return {
        ...line,
        discount: effectiveDiscount,
        description: service?.name ?? product?.name ?? "",
        unitPrice,
        taxRate,
        tax,
        total: Number((taxable + tax).toFixed(2)),
      };
    });
    const subtotal = calculated.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const discount = calculated.reduce((sum, line) => sum + line.discount, 0);
    const tax = calculated.reduce((sum, line) => sum + line.tax, 0);
    const total = Number((subtotal - discount + tax + parsed.data.tip).toFixed(2));
    const paid = Number(parsed.data.payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
    if (Math.abs(paid - total) > 0.01) throw new OperationsError("VALIDATION", "Payment total must equal invoice total", 400, { total, paid });

    const invoice = await db.$transaction(async (tx) => {
      for (const line of calculated.filter((item) => item.type === "PRODUCT")) {
        const stock = productMap.get(line.itemId)?.branchStock[0];
        if (!stock || Number(stock.quantity) < line.quantity) {
          throw new OperationsError("INSUFFICIENT_STOCK", `${line.description} has insufficient stock`, 409);
        }
        const changed = await tx.branchStock.updateMany({
          where: { branchId: branch.id, inventoryItemId: line.itemId, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (changed.count !== 1) throw new OperationsError("INSUFFICIENT_STOCK", `${line.description} has insufficient stock`, 409);
        await tx.stockMovement.create({
          data: {
            branchId: branch.id,
            inventoryItemId: line.itemId,
            type: "SALE",
            quantity: -line.quantity,
            reference: parsed.data.idempotencyKey,
            idempotencyKey: `${parsed.data.idempotencyKey}-${line.itemId}`,
          },
        });
      }
      for (const line of calculated.filter((item) => item.type === "SERVICE")) {
        const service = serviceMap.get(line.itemId);
        for (const recipe of service?.consumptionRecipes ?? []) {
          const required = Number(recipe.quantity) * line.quantity;
          const stock = recipe.inventoryItem.branchStock[0];
          if (!stock || Number(stock.quantity) < required) {
            throw new OperationsError("INSUFFICIENT_STOCK", `${recipe.inventoryItem.name} is insufficient for ${line.description}`, 409);
          }
          const changed = await tx.branchStock.updateMany({
            where: { branchId: branch.id, inventoryItemId: recipe.inventoryItemId, quantity: { gte: required } },
            data: { quantity: { decrement: required } },
          });
          if (changed.count !== 1) throw new OperationsError("INSUFFICIENT_STOCK", `${recipe.inventoryItem.name} is insufficient for ${line.description}`, 409);
          await tx.stockMovement.create({
            data: {
              branchId: branch.id,
              inventoryItemId: recipe.inventoryItemId,
              type: "SERVICE_CONSUMPTION",
              quantity: -required,
              reference: parsed.data.idempotencyKey,
              idempotencyKey: `${parsed.data.idempotencyKey}-recipe-${line.itemId}-${recipe.inventoryItemId}`,
            },
          });
        }
      }

      const fy = financialYear();
      const rows = await tx.$queryRaw<Array<{ sequence: number }>>(Prisma.sql`
        INSERT INTO "InvoiceSequence" ("id", "branchId", "financialYear", "taxMode", "nextNumber")
        VALUES (${crypto.randomUUID()}, ${branch.id}, ${fy}, ${parsed.data.taxMode}::"InvoiceTaxMode", 2)
        ON CONFLICT ("branchId", "financialYear", "taxMode")
        DO UPDATE SET "nextNumber" = "InvoiceSequence"."nextNumber" + 1
        RETURNING "nextNumber" - 1 AS sequence
      `);
      const sequence = Number(rows[0].sequence);
      const prefix = branch.slug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "RUV";
      const invoicePrefix = parsed.data.taxMode === "GST" ? "GST" : "NG";
      const number = `${invoicePrefix}-${prefix}-${fy}-${String(sequence).padStart(5, "0")}`;
      for (const [paymentIndex, payment] of parsed.data.payments.entries()) {
        if (payment.method === "WALLET") {
          const changed = await tx.customer.updateMany({
            where: { id: customer.id, walletBalance: { gte: payment.amount } },
            data: { walletBalance: { decrement: payment.amount } },
          });
          if (changed.count !== 1) throw new OperationsError("VALIDATION", "Customer wallet balance is insufficient", 400);
          await tx.benefitTransaction.create({
            data: { tenantId: context.tenant.id, branchId: branch.id, customerId: customer.id, kind: "WALLET_REDEEM", sourceType: "INVOICE", amount: payment.amount, note: number, idempotencyKey: `${parsed.data.idempotencyKey}-wallet-${paymentIndex}` },
          });
        }
        if (payment.method === "GIFT_CARD") {
          if (!payment.reference) throw new OperationsError("VALIDATION", "Gift card payment requires a code or reference", 400);
          const card = await tx.giftCard.findFirst({
            where: {
              tenantId: context.tenant.id,
              status: "ACTIVE",
              balance: { gte: payment.amount },
              AND: [
                { OR: [{ id: payment.reference }, { code: payment.reference }] },
                { OR: [{ customerId: customer.id }, { customerId: null }] },
                { OR: [{ branchId: branch.id }, { branchId: null }] },
              ],
            },
          });
          if (!card || (card.expiresAt && card.expiresAt < new Date())) throw new OperationsError("VALIDATION", "Gift card is invalid, expired, or has insufficient balance", 400);
          await tx.giftCard.update({ where: { id: card.id }, data: { balance: { decrement: payment.amount } } });
          await tx.benefitTransaction.create({
            data: { tenantId: context.tenant.id, branchId: branch.id, customerId: customer.id, kind: "GIFT_CARD_REDEEM", sourceType: "INVOICE", sourceId: card.id, amount: payment.amount, note: number, idempotencyKey: `${parsed.data.idempotencyKey}-gift-${paymentIndex}-${card.id}` },
          });
        }
        if (payment.method === "LOYALTY") {
          const rule = rewardRule ?? { amountPerPoint: new Prisma.Decimal(1), minRedeemPoints: 0, maxRedeemPercent: new Prisma.Decimal(20) };
          const pointsNeeded = Math.ceil(payment.amount / Number(rule.amountPerPoint));
          const maxRedeemAmount = total * Number(rule.maxRedeemPercent) / 100;
          const balance = await tx.loyaltyLedger.aggregate({ where: { customerId: customer.id }, _sum: { points: true } });
          const availablePoints = Number(balance._sum.points ?? 0);
          if (pointsNeeded < Number(rule.minRedeemPoints) || payment.amount > maxRedeemAmount || availablePoints < pointsNeeded) {
            throw new OperationsError("VALIDATION", "Loyalty redemption is not allowed for this invoice", 400, { pointsNeeded, availablePoints, maxRedeemAmount });
          }
          await tx.loyaltyLedger.create({ data: { customerId: customer.id, points: -pointsNeeded, reason: `Redeemed on invoice ${number}` } });
          await tx.benefitTransaction.create({
            data: { tenantId: context.tenant.id, branchId: branch.id, customerId: customer.id, kind: "LOYALTY_REDEEM", sourceType: "INVOICE", amount: payment.amount, points: -pointsNeeded, note: number, idempotencyKey: `${parsed.data.idempotencyKey}-loyalty-${paymentIndex}` },
          });
        }
      }
      const created = await tx.invoice.create({
        data: {
          number,
          branchId: branch.id,
          customerId: customer.id,
          appointmentId: appointment?.id,
          subtotal,
          discount,
          tax,
          taxMode: parsed.data.taxMode,
          tip: parsed.data.tip,
          total,
          status: "PAID",
          type: "SALE",
          idempotencyKey: parsed.data.idempotencyKey,
          lines: {
            create: calculated.map((line) => ({
              type: line.type,
              description: line.description,
              serviceId: line.type === "SERVICE" ? line.itemId : null,
              inventoryItemId: line.type === "PRODUCT" ? line.itemId : null,
              staffId: line.staffId && staffMap.has(line.staffId) ? line.staffId : appointment?.staffId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              taxRate: line.taxRate,
              tax: line.tax,
              total: line.total,
            })),
          },
          payments: { create: parsed.data.payments },
        },
        include: { lines: true, payments: true },
      });

      for (const line of calculated.filter((item) => item.type === "SERVICE" && item.packagePurchaseId)) {
        const purchase = await tx.packagePurchase.findUnique({ where: { id: line.packagePurchaseId! } });
        const balance = packageBalanceLines(purchase?.balance);
        const nextBalance = balance.map((item) => item.serviceId === line.itemId ? { ...item, quantity: item.quantity - line.quantity } : item);
        const matched = balance.find((item) => item.serviceId === line.itemId);
        if (!matched || matched.quantity < line.quantity) {
          throw new OperationsError("VALIDATION", `${line.description} package balance changed during checkout`, 409);
        }
        await tx.packagePurchase.update({
          where: { id: line.packagePurchaseId! },
          data: {
            balance: nextBalance as Prisma.InputJsonValue,
            status: nextBalance.some((item) => item.quantity > 0) ? "ACTIVE" : "USED",
          },
        });
        await tx.benefitTransaction.create({
          data: {
            tenantId: context.tenant.id,
            branchId: branch.id,
            customerId: customer.id,
            kind: "PACKAGE_REDEEM",
            sourceType: "INVOICE",
            sourceId: created.id,
            amount: line.unitPrice * line.quantity,
            note: `${number}|packagePurchase=${line.packagePurchaseId}|service=${line.itemId}|quantity=${line.quantity}|${line.description}`,
            idempotencyKey: `${parsed.data.idempotencyKey}-package-${line.packagePurchaseId}-${line.itemId}`,
          },
        });
      }

      for (const line of calculated.filter((item) => item.type === "SERVICE")) {
        const staffId = line.staffId && staffMap.has(line.staffId) ? line.staffId : appointment?.staffId;
        const member = staffId ? staffMap.get(staffId) ?? await tx.staff.findUnique({ where: { id: staffId } }) : null;
        if (member) {
          const base = line.unitPrice * line.quantity - line.discount;
          await tx.commission.create({
            data: {
              staffId: member.id,
              amount: Number((base * Number(member.commissionRate) / 100).toFixed(2)),
              source: "INVOICE",
              sourceId: created.id,
              idempotencyKey: `${parsed.data.idempotencyKey}-commission-${line.itemId}-${member.id}`,
            },
          });
        }
      }
      const earnableAmount = rewardRule?.earnOnTax ? total : subtotal - discount;
      const loyaltyPoints = Math.floor(earnableAmount * Number(rewardRule?.pointsPerAmount ?? 0.01));
      if (loyaltyPoints > 0) {
        const expiresAt = rewardRule?.expiryDays ? new Date(Date.now() + rewardRule.expiryDays * 86_400_000) : null;
        await tx.loyaltyLedger.create({ data: { customerId: customer.id, points: loyaltyPoints, reason: `Invoice ${number}`, expiresAt } });
        await tx.benefitTransaction.create({
          data: { tenantId: context.tenant.id, branchId: branch.id, customerId: customer.id, kind: "LOYALTY_EARN", sourceType: "INVOICE", sourceId: created.id, points: loyaltyPoints, note: number, idempotencyKey: `${parsed.data.idempotencyKey}-loyalty-earn` },
        });
      }
      if (appointment && appointment.status !== "COMPLETED") {
        await tx.appointment.update({ where: { id: appointment.id }, data: { status: "COMPLETED" } });
        await tx.appointmentStatusHistory.create({ data: { appointmentId: appointment.id, status: "COMPLETED", note: `Completed by invoice ${number}` } });
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "INVOICE_PAID",
          entity: "Invoice",
          entityId: created.id,
          metadata: { number, total, idempotencyKey: parsed.data.idempotencyKey },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({ data: invoice }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
