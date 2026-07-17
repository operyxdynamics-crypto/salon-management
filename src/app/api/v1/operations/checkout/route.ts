import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calculateTaxLine, resolveServiceSalePricing } from "@/lib/billing";
import { resolveCoupon } from "@/lib/coupon-service";
import { allocateCouponDiscount, type CouponCartLine } from "@/lib/coupons";
import { db } from "@/lib/db";
import { supplierEntityIdForBranch, validateBranchRegistration } from "@/lib/gst";
import { buildInvoiceNumber, financialYearCode } from "@/lib/invoice-number";
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
  couponCode: z.string().trim().min(1).max(40).optional(),
  idempotencyKey: z.string().min(12).max(120),
});

type PackageBalanceLine = { serviceId: string; quantity: number };

function canCheckoutAppointmentStatus(status: string) {
  return !["WAITLISTED", "CANCELLED", "NO_SHOW"].includes(status);
}

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

    // Who is supplying this sale? The operator of the branch - which for a FOFO franchise is the
    // franchisee, not the company. The supplier's identity and registration are snapshotted onto
    // the invoice, because an invoice is a legal record of a specific supply on a specific day.
    const branchProfile = await db.branch.findUnique({
      where: { id: branch.id },
      select: {
        state: true,
        invoiceCode: true,
        ownerEntityId: true,
        operatorEntityId: true,
        operatorEntity: { select: { id: true, legalName: true } },
        ownerEntity: { select: { id: true, legalName: true } },
        gstRegistration: { select: { id: true, gstin: true, state: true, stateCode: true, legalEntityId: true, isActive: true } },
      },
    });
    const supplierEntityId = supplierEntityIdForBranch(branchProfile ?? {});
    const supplier = branchProfile?.operatorEntity ?? branchProfile?.ownerEntity ?? null;
    const registration = branchProfile?.gstRegistration ?? null;

    // Refuse rather than guess. Deriving a code here is what caused branches to collide on the same
    // invoice number; an explicit code is the only thing that keeps each branch's series its own.
    const invoiceCode = branchProfile?.invoiceCode;
    if (!invoiceCode) {
      throw new OperationsError("POLICY", "This branch has no invoice code yet. Add one in Settings → Branch before billing.", 409);
    }

    if (parsed.data.taxMode === "GST") {
      const check = validateBranchRegistration({
        branchState: branchProfile?.state ?? "",
        registration,
        operatorEntityId: supplierEntityId,
      });
      if (!check.ok) {
        throw new OperationsError("POLICY", `${check.reason} Fix this in Settings before raising a GST invoice, or bill without GST.`, 409);
      }
    }
    const existing = await db.invoice.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey }, include: { lines: true, payments: true } });
    if (existing) return Response.json({ data: existing });

    const customer = await db.customer.findFirst({ where: { id: parsed.data.customerId, tenantId: context.tenant.id } });
    if (!customer) throw new OperationsError("NOT_FOUND", "Customer not found", 404);
    const appointment = parsed.data.appointmentId
      ? await db.appointment.findFirst({ where: { id: parsed.data.appointmentId, branchId: branch.id, customerId: customer.id }, include: { invoice: { select: { id: true, number: true } } } })
      : null;
    if (parsed.data.appointmentId && !appointment) throw new OperationsError("NOT_FOUND", "Appointment not found", 404);
    if (appointment?.invoice) {
      throw new OperationsError("APPOINTMENT_ALREADY_INVOICED", "This appointment already has an invoice", 409, { invoiceId: appointment.invoice.id, invoiceNumber: appointment.invoice.number });
    }
    if (appointment && !canCheckoutAppointmentStatus(appointment.status)) {
      throw new OperationsError("POLICY", `Checkout is unavailable for ${appointment.status.toLowerCase().replaceAll("_", " ")} appointments`, 409, { appointmentId: appointment.id, status: appointment.status });
    }

    const serviceIds = parsed.data.lines.filter((line) => line.type === "SERVICE").map((line) => line.itemId);
    const productIds = parsed.data.lines.filter((line) => line.type === "PRODUCT").map((line) => line.itemId);
    const packagePurchaseIds = parsed.data.lines.flatMap((line) => line.packagePurchaseId ? [line.packagePurchaseId] : []);
    const [services, products, staff, packagePurchases, rewardRule] = await Promise.all([
      db.service.findMany({
        where: { id: { in: serviceIds }, tenantId: context.tenant.id, isActive: true },
        include: {
          branches: { where: { branchId: branch.id } },
          taxClass: { select: { code: true } },
          consumptionRecipes: { where: { isActive: true }, include: { inventoryItem: { include: { branchStock: { where: { branchId: branch.id } } } } } },
        },
      }),
      db.inventoryItem.findMany({
        where: { id: { in: productIds }, tenantId: context.tenant.id },
        include: { branchStock: { where: { branchId: branch.id } }, taxClass: { select: { code: true } } },
      }),
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
      const branchService = service?.branches[0];
      const servicePricing = service ? resolveServiceSalePricing({
        price: Number(service.price),
        taxRate: Number(service.taxRate),
        priceTaxMode: service.priceTaxMode,
        isActive: service.isActive,
      }, branchService ? {
        price: branchService.price === null ? null : Number(branchService.price),
        taxRate: branchService.taxRate === null ? null : Number(branchService.taxRate),
        priceTaxMode: branchService.priceTaxMode,
        isActive: branchService.isActive,
      } : null) : null;
      if (servicePricing && !servicePricing.isActive) {
        throw new OperationsError("POLICY", `${service?.name ?? "Selected service"} is inactive for this branch`, 409);
      }
      if (line.packagePurchaseId && line.type !== "SERVICE") throw new OperationsError("VALIDATION", "Packages can only redeem service lines", 400);
      if (line.packagePurchaseId) {
        const purchase = packageMap.get(line.packagePurchaseId);
        const balance = packageBalanceLines(purchase?.balance);
        const matched = balance.find((item) => item.serviceId === line.itemId);
        if (!matched || matched.quantity < line.quantity) {
          throw new OperationsError("VALIDATION", `${service?.name ?? "Selected service"} is not available in this package balance`, 400);
        }
      }
      const unitPrice = servicePricing?.price ?? Number(product?.retailPrice ?? 0);
      const taxRate = servicePricing?.taxRate ?? Number(product?.taxRate ?? 18);
      const priceTaxMode = servicePricing?.priceTaxMode ?? product?.priceTaxMode ?? "EXCLUSIVE";
      const base = unitPrice * line.quantity;
      const effectiveDiscount = line.packagePurchaseId ? base : line.discount;
      if (effectiveDiscount > base) throw new OperationsError("VALIDATION", "Discount cannot exceed line value", 400);
      const amounts = calculateTaxLine({
        quantity: line.quantity,
        unitPrice,
        discount: effectiveDiscount,
        taxRate,
        priceTaxMode,
        invoiceTaxMode: parsed.data.taxMode,
      });
      return {
        ...line,
        discount: effectiveDiscount,
        description: service?.name ?? product?.name ?? "",
        // Snapshotted, not referenced. A GST invoice is a legal record of what was billed on the
        // day; re-pointing an item at a different tax class later must not rewrite it.
        hsnCode: service?.taxClass?.code ?? product?.taxClass?.code ?? null,
        unitPrice,
        taxRate,
        priceTaxMode,
        taxable: amounts.taxable,
        tax: amounts.tax,
        total: amounts.total,
      };
    });
    // A coupon discounts the bill, but GST is computed per line - so the bill-level discount has
    // to be pushed down onto the lines before tax, or the tax comes out wrong. Resolve it here so
    // the payment total can be validated against the discounted amount; it is resolved again
    // inside the transaction, where the usage caps are actually enforced.
    const couponCart: CouponCartLine[] = calculated.map((line) => ({
      type: line.type,
      itemId: line.itemId,
      categoryId: line.type === "SERVICE"
        ? serviceMap.get(line.itemId)?.categoryId ?? null
        : productMap.get(line.itemId)?.categoryId ?? null,
      netAmount: Number((line.unitPrice * line.quantity - line.discount).toFixed(2)),
    }));

    let couponDiscountTotal = 0;
    let couponAllocations = new Map<string, number>();
    let couponId: string | null = null;

    if (parsed.data.couponCode) {
      const { result, rules } = await resolveCoupon(db, {
        tenantId: context.tenant.id,
        branchId: branch.id,
        code: parsed.data.couponCode,
        customerId: customer.id,
        cart: couponCart,
      });
      if (!result.ok) throw new OperationsError("COUPON_REJECTED", result.reason, 400, { code: parsed.data.couponCode });
      couponDiscountTotal = result.discount;
      couponId = result.couponId;
      couponAllocations = allocateCouponDiscount(rules!, couponCart, result.discount);
    }

    // Re-price every line with its share of the coupon folded into the line discount.
    const priced = calculated.map((line) => {
      const couponShare = couponAllocations.get(`${line.type}-${line.itemId}`) ?? 0;
      if (couponShare <= 0) return line;
      const lineDiscount = Number((line.discount + couponShare).toFixed(2));
      const amounts = calculateTaxLine({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: lineDiscount,
        taxRate: line.taxRate,
        priceTaxMode: line.priceTaxMode,
        invoiceTaxMode: parsed.data.taxMode,
      });
      return { ...line, discount: lineDiscount, taxable: amounts.taxable, tax: amounts.tax, total: amounts.total };
    });

    const subtotal = priced.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const discount = priced.reduce((sum, line) => sum + line.discount, 0);
    const tax = priced.reduce((sum, line) => sum + line.tax, 0);
    const total = Number((priced.reduce((sum, line) => sum + line.total, 0) + parsed.data.tip).toFixed(2));
    const paid = Number(parsed.data.payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
    if (Math.abs(paid - total) > 0.01) throw new OperationsError("VALIDATION", "Payment total must equal invoice total", 400, { total, paid });

    const invoice = await db.$transaction(async (tx) => {
      // Re-resolve the coupon under the transaction's snapshot. Two receptionists can race for
      // the last use of a capped coupon; the check above was only good enough to price the bill.
      // If anything changed, the sale is rejected rather than silently charged a different total.
      if (parsed.data.couponCode) {
        const { result } = await resolveCoupon(tx, {
          tenantId: context.tenant.id,
          branchId: branch.id,
          code: parsed.data.couponCode,
          customerId: customer.id,
          cart: couponCart,
        });
        if (!result.ok) throw new OperationsError("COUPON_REJECTED", result.reason, 409, { code: parsed.data.couponCode });
        if (Math.abs(result.discount - couponDiscountTotal) > 0.01) {
          throw new OperationsError("COUPON_CHANGED", "This coupon's discount changed. Re-apply it and take payment again.", 409, {
            expected: couponDiscountTotal,
            actual: result.discount,
          });
        }
      }

      if (appointment) {
        const existingAppointmentInvoice = await tx.invoice.findUnique({ where: { appointmentId: appointment.id }, select: { id: true, number: true } });
        if (existingAppointmentInvoice) {
          throw new OperationsError("APPOINTMENT_ALREADY_INVOICED", "This appointment already has an invoice", 409, { invoiceId: existingAppointmentInvoice.id, invoiceNumber: existingAppointmentInvoice.number });
        }
      }
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

      const fy = financialYearCode();
      const rows = await tx.$queryRaw<Array<{ sequence: number }>>(Prisma.sql`
        INSERT INTO "InvoiceSequence" ("id", "branchId", "financialYear", "taxMode", "nextNumber")
        VALUES (${crypto.randomUUID()}, ${branch.id}, ${fy}, ${parsed.data.taxMode}::"InvoiceTaxMode", 2)
        ON CONFLICT ("branchId", "financialYear", "taxMode")
        DO UPDATE SET "nextNumber" = "InvoiceSequence"."nextNumber" + 1
        RETURNING "nextNumber" - 1 AS sequence
      `);
      const sequence = Number(rows[0].sequence);
      // The branch's own code, never derived from the slug at billing time: two branches whose
      // slugs share their first four letters would otherwise issue the same number, and a globally
      // unique invoice number then rejects the sale for good.
      const number = buildInvoiceNumber({ code: invoiceCode, financialYear: fy, taxMode: parsed.data.taxMode, sequence });
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
          legalEntityId: supplierEntityId,
          gstRegistrationId: registration?.id ?? null,
          supplierName: supplier?.legalName ?? null,
          supplierGstin: registration?.gstin ?? null,
          supplierStateCode: registration?.stateCode ?? null,
          placeOfSupplyState: branchProfile?.state ?? null,
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
            create: priced.map((line) => ({
              type: line.type,
              description: line.description,
              serviceId: line.type === "SERVICE" ? line.itemId : null,
              inventoryItemId: line.type === "PRODUCT" ? line.itemId : null,
              staffId: line.staffId && staffMap.has(line.staffId) ? line.staffId : appointment?.staffId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              taxRate: line.taxRate,
              hsnCode: line.hsnCode,
              priceTaxMode: line.priceTaxMode,
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

      if (couponId) {
        await tx.couponRedemption.create({
          data: {
            couponId,
            invoiceId: created.id,
            customerId: customer.id,
            amount: couponDiscountTotal,
          },
        });
      }

      // Commission and loyalty are earned on the discounted line values, not the list price -
      // `priced` already carries the coupon's share.
      for (const line of priced.filter((item) => item.type === "SERVICE")) {
        const staffId = line.staffId && staffMap.has(line.staffId) ? line.staffId : appointment?.staffId;
        const member = staffId ? staffMap.get(staffId) ?? await tx.staff.findUnique({ where: { id: staffId } }) : null;
        if (member) {
          const base = line.taxable;
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
      const earnableAmount = rewardRule?.earnOnTax
        ? priced.reduce((sum, line) => sum + line.total, 0)
        : priced.reduce((sum, line) => sum + line.taxable, 0);
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
