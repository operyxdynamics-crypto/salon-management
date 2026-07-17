import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import {
  allocateRefundTenders,
  loyaltyPointsForAmount,
  proportionalPoints,
  RefundAllocationError,
  type InvoiceTender,
  type RefundTenderMethod,
} from "@/lib/refund";

const refundLineSchema = z.object({
  invoiceLineId: z.string().min(1),
  quantity: z.number().positive(),
});

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("REFUND"),
    branchId: z.string().min(1),
    reason: z.string().min(3).max(300),
    method: z.enum(["CASH", "CARD", "UPI"]).default("CASH"),
    reference: z.string().max(100).optional(),
    restockProducts: z.boolean().default(true),
    lines: z.array(refundLineSchema).min(1).optional(),
    idempotencyKey: z.string().min(12).max(120),
  }),
  z.object({
    action: z.literal("VOID"),
    branchId: z.string().min(1),
    reason: z.string().min(3).max(300),
    idempotencyKey: z.string().min(12).max(120),
  }),
]);

function financialYear(date = new Date()) {
  const india = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const year = india.getFullYear();
  const start = india.getMonth() >= 3 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

function money(value: number) {
  return Number(value.toFixed(2));
}

function quantity(value: unknown) {
  return Number(value ?? 0);
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

function packageRedemptionFromNote(note: string | null) {
  if (!note) return null;
  const packagePurchaseId = note.match(/packagePurchase=([^|]+)/)?.[1];
  const serviceId = note.match(/service=([^|]+)/)?.[1];
  const quantityValue = Number(note.match(/quantity=([^|]+)/)?.[1] ?? 0);
  return packagePurchaseId && serviceId && quantityValue > 0 ? { packagePurchaseId, serviceId, quantity: quantityValue } : null;
}

function lineRefundAmounts(line: { quantity: Prisma.Decimal | number; unitPrice: Prisma.Decimal | number; discount: Prisma.Decimal | number; tax: Prisma.Decimal | number; total: Prisma.Decimal | number }, selectedQuantity: number) {
  const originalQuantity = quantity(line.quantity);
  const ratio = originalQuantity > 0 ? selectedQuantity / originalQuantity : 0;
  const subtotal = money(Number(line.unitPrice) * selectedQuantity);
  const discount = money(Number(line.discount) * ratio);
  const tax = money(Number(line.tax) * ratio);
  const total = money(Number(line.total) * ratio);
  return { ratio, subtotal, discount, tax, total };
}

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid invoice action", 400, parsed.error.flatten());
    const { invoiceId } = await params;
    const context = await requireOperationsContext("sale:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, branchId: branch.id },
      include: {
        lines: true,
        payments: true,
        refundInvoices: { where: { type: "REFUND", status: { not: "VOID" } }, include: { lines: true, payments: true } },
      },
    });
    if (!invoice) throw new OperationsError("NOT_FOUND", "Invoice not found", 404);
    if (invoice.type !== "SALE") throw new OperationsError("CONFLICT", "Only sale invoices can be refunded or voided", 409);
    if (["REFUNDED", "VOID"].includes(invoice.status)) throw new OperationsError("CONFLICT", "This invoice is already closed", 409);
    const existing = await db.invoice.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey }, include: { lines: true, payments: true } });
    if (existing) return Response.json({ data: existing });

    if (parsed.data.action === "VOID") {
      const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      if (paid > 0) throw new OperationsError("CONFLICT", "Paid invoices must be refunded instead of voided", 409);
      const voided = await db.invoice.update({
        where: { id: invoice.id },
        data: { status: "VOID", voidReason: parsed.data.reason },
      });
      await db.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "INVOICE_VOIDED",
          entity: "Invoice",
          entityId: invoice.id,
          metadata: { reason: parsed.data.reason, idempotencyKey: parsed.data.idempotencyKey },
        },
      });
      return Response.json({ data: voided });
    }

    const refundData = parsed.data;
    const alreadyRefundedByLine = new Map<string, number>();
    let previousRefundTotal = 0;
    for (const refundInvoice of invoice.refundInvoices) {
      previousRefundTotal += Number(refundInvoice.total);
      for (const refundLine of refundInvoice.lines) {
        if (!refundLine.refundSourceLineId) continue;
        alreadyRefundedByLine.set(refundLine.refundSourceLineId, (alreadyRefundedByLine.get(refundLine.refundSourceLineId) ?? 0) + quantity(refundLine.quantity));
      }
    }

    const originalLineMap = new Map(invoice.lines.map((line) => [line.id, line]));
    const requestedLines = refundData.lines?.length
      ? refundData.lines
      : invoice.lines.map((line) => ({ invoiceLineId: line.id, quantity: Math.max(0, quantity(line.quantity) - (alreadyRefundedByLine.get(line.id) ?? 0)) })).filter((line) => line.quantity > 0);

    const mergedRequests = new Map<string, number>();
    for (const requestLine of requestedLines) {
      mergedRequests.set(requestLine.invoiceLineId, money((mergedRequests.get(requestLine.invoiceLineId) ?? 0) + requestLine.quantity));
    }

    const selectedLines = Array.from(mergedRequests.entries()).map(([lineId, selectedQuantity]) => {
      const line = originalLineMap.get(lineId);
      if (!line) throw new OperationsError("VALIDATION", "Selected refund line is not part of this invoice", 400);
      const originalQuantity = quantity(line.quantity);
      const alreadyRefunded = alreadyRefundedByLine.get(line.id) ?? 0;
      const remaining = money(originalQuantity - alreadyRefunded);
      if (selectedQuantity <= 0 || selectedQuantity > remaining + 0.0001) {
        throw new OperationsError("VALIDATION", `${line.description} can refund only ${remaining} remaining`, 400);
      }
      return { line, selectedQuantity, amounts: lineRefundAmounts(line, selectedQuantity), remaining };
    });
    if (!selectedLines.length) throw new OperationsError("VALIDATION", "No refundable line quantity remains", 400);

    const refundSubtotal = money(selectedLines.reduce((sum, item) => sum + item.amounts.subtotal, 0));
    const refundDiscount = money(selectedLines.reduce((sum, item) => sum + item.amounts.discount, 0));
    const refundTax = money(selectedLines.reduce((sum, item) => sum + item.amounts.tax, 0));
    const isFirstFullInvoiceRefund = previousRefundTotal <= 0.01 && invoice.lines.every((line) => {
      const selected = mergedRequests.get(line.id) ?? 0;
      return selected >= quantity(line.quantity) - 0.0001;
    });
    const refundTip = isFirstFullInvoiceRefund ? Number(invoice.tip) : 0;
    const refundTotal = money(selectedLines.reduce((sum, item) => sum + item.amounts.total, 0) + refundTip);
    if (refundTotal <= 0) throw new OperationsError("VALIDATION", "Refund total must be greater than zero", 400);
    const finalRefundTotal = money(previousRefundTotal + refundTotal);
    const refundRatio = Math.min(1, refundTotal / Math.max(Number(invoice.total), 0.01));

    // Split the refund across the tenders the customer actually paid with. Wallet,
    // gift card, and loyalty value must return to the instrument it came from; only
    // the cash-equivalent remainder leaves the drawer in the operator's chosen method.
    const originalTenders: InvoiceTender[] = invoice.payments.map((payment) => ({
      id: payment.id,
      method: payment.method as RefundTenderMethod,
      amount: Number(payment.amount),
      reference: payment.reference,
    }));
    const priorRefundTenders = invoice.refundInvoices.flatMap((refundInvoice) => refundInvoice.payments.map((payment) => ({
      method: payment.method as RefundTenderMethod,
      amount: Number(payment.amount),
      reference: payment.reference,
    })));

    let allocations;
    try {
      allocations = allocateRefundTenders({
        refundTotal,
        tenders: originalTenders,
        priorRefundTenders,
        cashMethod: refundData.method,
        cashReference: refundData.reference ?? null,
      });
    } catch (allocationError) {
      if (allocationError instanceof RefundAllocationError) {
        throw new OperationsError("VALIDATION", allocationError.message, 400, allocationError.details);
      }
      throw allocationError;
    }

    const rewardRule = await db.rewardRule.findFirst({
      where: { tenantId: context.tenant.id, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    const amountPerPoint = Number(rewardRule?.amountPerPoint ?? 1);

    const refund = await db.$transaction(async (tx) => {
      const originalBenefits = await tx.benefitTransaction.findMany({
        where: {
          tenantId: context.tenant.id,
          customerId: invoice.customerId,
          OR: [{ sourceId: invoice.id }, { note: invoice.number }],
        },
      });
      const fy = financialYear();
      const rows = await tx.$queryRaw<Array<{ sequence: number }>>(Prisma.sql`
        INSERT INTO "InvoiceSequence" ("id", "branchId", "financialYear", "taxMode", "nextNumber")
        VALUES (${crypto.randomUUID()}, ${branch.id}, ${fy}, ${invoice.taxMode}::"InvoiceTaxMode", 2)
        ON CONFLICT ("branchId", "financialYear", "taxMode")
        DO UPDATE SET "nextNumber" = "InvoiceSequence"."nextNumber" + 1
        RETURNING "nextNumber" - 1 AS sequence
      `);
      const sequence = Number(rows[0].sequence);
      const prefix = branch.slug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "RUV";
      const number = `CRN-${invoice.taxMode === "GST" ? "GST" : "NG"}-${prefix}-${fy}-${String(sequence).padStart(5, "0")}`;

      const created = await tx.invoice.create({
        data: {
          number,
          branchId: branch.id,
          customerId: invoice.customerId,
          parentInvoiceId: invoice.id,
          subtotal: refundSubtotal,
          discount: refundDiscount,
          tax: refundTax,
          taxMode: invoice.taxMode,
          tip: refundTip,
          total: refundTotal,
          status: "PAID",
          type: "REFUND",
          voidReason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
          lines: {
            create: selectedLines.map(({ line, selectedQuantity, amounts }) => ({
              type: line.type,
              description: `Refund: ${line.description}`,
              serviceId: line.serviceId,
              inventoryItemId: line.inventoryItemId,
              staffId: line.staffId,
              quantity: selectedQuantity,
              unitPrice: line.unitPrice,
              discount: amounts.discount,
              taxRate: line.taxRate,
              // A credit note is a GST document too, and must carry the same code as the line
              // it reverses.
              hsnCode: line.hsnCode,
              priceTaxMode: line.priceTaxMode,
              tax: amounts.tax,
              total: amounts.total,
              refundSourceLineId: line.id,
            })),
          },
          payments: {
            create: allocations.map((allocation) => ({
              method: allocation.method,
              amount: allocation.amount,
              reference: allocation.reference,
            })),
          },
        },
        include: { lines: true, payments: true },
      });

      if (refundData.restockProducts) {
        for (const { line, selectedQuantity } of selectedLines.filter((item) => item.line.type === "PRODUCT" && item.line.inventoryItemId)) {
          await tx.branchStock.upsert({
            where: { branchId_inventoryItemId: { branchId: branch.id, inventoryItemId: line.inventoryItemId! } },
            update: { quantity: { increment: selectedQuantity } },
            create: { branchId: branch.id, inventoryItemId: line.inventoryItemId!, quantity: selectedQuantity },
          });
          await tx.stockMovement.create({
            data: {
              branchId: branch.id,
              inventoryItemId: line.inventoryItemId!,
              type: "REFUND_RETURN",
              quantity: selectedQuantity,
              reference: created.number,
              idempotencyKey: `${parsed.data.idempotencyKey}-return-${line.id}`,
            },
          });
        }
      }

      const invoiceCommissions = await tx.commission.findMany({ where: { source: "INVOICE", sourceId: invoice.id } });
      for (const { line, selectedQuantity, amounts } of selectedLines.filter((item) => item.line.type === "SERVICE" && item.line.staffId)) {
        const staffId = line.staffId!;
        const staffServiceBase = invoice.lines
          .filter((item) => item.type === "SERVICE" && item.staffId === staffId)
          .reduce((sum, item) => sum + Number(item.unitPrice) * quantity(item.quantity) - Number(item.discount), 0);
        const staffCommission = invoiceCommissions.filter((item) => item.staffId === staffId).reduce((sum, item) => sum + Number(item.amount), 0);
        const selectedBase = Math.max(0, Number(line.unitPrice) * selectedQuantity - amounts.discount);
        const reversal = staffServiceBase > 0 ? money(staffCommission * selectedBase / staffServiceBase) : 0;
        if (reversal > 0) {
          await tx.commission.create({
            data: {
              staffId,
              amount: -reversal,
              source: "REFUND",
              sourceId: created.id,
              idempotencyKey: `${parsed.data.idempotencyKey}-commission-${line.id}`,
            },
          });
        }
      }

      // Restore only what was actually allocated back to each instrument. The
      // cash-equivalent allocation is settled by the PaymentRecord row alone - it
      // must not also credit a wallet or card, which is how the old code paid twice.
      for (const [allocationIndex, allocation] of allocations.entries()) {
        if (!allocation.restricted || allocation.amount <= 0) continue;

        if (allocation.method === "WALLET") {
          await tx.customer.update({ where: { id: invoice.customerId }, data: { walletBalance: { increment: allocation.amount } } });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "WALLET_REFUND",
              sourceType: "REFUND",
              sourceId: created.id,
              amount: allocation.amount,
              note: `Restored from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-wallet-refund-${allocationIndex}`,
            },
          });
        }

        if (allocation.method === "GIFT_CARD" && allocation.reference) {
          const card = await tx.giftCard.findFirst({
            where: { tenantId: context.tenant.id, OR: [{ id: allocation.reference }, { code: allocation.reference }] },
          });
          if (!card) {
            throw new OperationsError("VALIDATION", "The gift card used on this invoice no longer exists, so its value cannot be returned", 409, { reference: allocation.reference });
          }
          await tx.giftCard.update({ where: { id: card.id }, data: { balance: { increment: allocation.amount }, status: "ACTIVE" } });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "GIFT_CARD_REFUND",
              sourceType: "REFUND",
              sourceId: created.id,
              amount: allocation.amount,
              note: `Restored ${card.code} from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-gift-refund-${allocationIndex}`,
            },
          });
        }

        if (allocation.method === "LOYALTY") {
          const points = loyaltyPointsForAmount(allocation.amount, amountPerPoint);
          if (points <= 0) continue;
          await tx.loyaltyLedger.create({
            data: { customerId: invoice.customerId, points, reason: `Refund restored redemption ${number}` },
          });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "LOYALTY_REFUND",
              sourceType: "REFUND",
              sourceId: created.id,
              amount: allocation.amount,
              points,
              note: `Restored from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-loyalty-refund-${allocationIndex}`,
            },
          });
        }
      }

      const selectedServiceQuantities = new Map<string, number>();
      for (const { line, selectedQuantity } of selectedLines.filter((item) => item.line.serviceId)) {
        selectedServiceQuantities.set(line.serviceId!, (selectedServiceQuantities.get(line.serviceId!) ?? 0) + selectedQuantity);
      }

      for (const benefit of originalBenefits) {
        // LOYALTY_REDEEM is restored by the tender allocation above, in proportion to
        // the loyalty value actually returned. Reversing it here as well would double it.
        if (benefit.kind === "LOYALTY_EARN" && benefit.points && benefit.points > 0) {
          const points = proportionalPoints(benefit.points, refundRatio);
          if (points <= 0) continue;
          await tx.loyaltyLedger.create({ data: { customerId: invoice.customerId, points: -points, reason: `Refund reversed earn ${number}` } });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "LOYALTY_REVERSAL",
              sourceType: "REFUND",
              sourceId: created.id,
              points: -points,
              note: `Reversed earn from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-loyalty-earn-${benefit.id}`,
            },
          });
        }
        if (benefit.kind === "PACKAGE_REDEEM") {
          const redemption = packageRedemptionFromNote(benefit.note);
          if (!redemption) continue;
          const selectedQuantity = selectedServiceQuantities.get(redemption.serviceId) ?? 0;
          const restoreQuantity = Math.min(redemption.quantity, selectedQuantity);
          if (restoreQuantity <= 0) continue;
          const purchase = await tx.packagePurchase.findUnique({ where: { id: redemption.packagePurchaseId } });
          if (!purchase) continue;
          const balance = packageBalanceLines(purchase.balance);
          const serviceExists = balance.some((item) => item.serviceId === redemption.serviceId);
          const nextBalance = serviceExists
            ? balance.map((item) => item.serviceId === redemption.serviceId ? { ...item, quantity: item.quantity + restoreQuantity } : item)
            : [...balance, { serviceId: redemption.serviceId, quantity: restoreQuantity }];
          await tx.packagePurchase.update({
            where: { id: purchase.id },
            data: { balance: nextBalance as Prisma.InputJsonValue, status: "ACTIVE" },
          });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "PACKAGE_REFUND",
              sourceType: "REFUND",
              sourceId: created.id,
              amount: benefit.amount === null ? null : money(Number(benefit.amount) * (restoreQuantity / Math.max(redemption.quantity, 1))),
              note: `Restored ${restoreQuantity} use(s) from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-package-${benefit.id}`,
            },
          });
        }
      }

      // Give the coupon back, but only on a full refund. A coupon is a bill-level thing: if the
      // customer keeps half the sale, they have still used it. Deleting the redemption row is
      // what restores their usage allowance and the coupon's remaining count.
      const fullyRefunded = finalRefundTotal >= Number(invoice.total) - 0.01;
      if (fullyRefunded) {
        const redemption = await tx.couponRedemption.findUnique({ where: { invoiceId: invoice.id } });
        if (redemption) {
          await tx.couponRedemption.delete({ where: { invoiceId: invoice.id } });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "COUPON_REFUND",
              sourceType: "REFUND",
              sourceId: created.id,
              amount: Number(redemption.amount),
              note: `Coupon returned from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-coupon-${redemption.id}`,
            },
          });
        }
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
          voidReason: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: finalRefundTotal >= Number(invoice.total) - 0.01 ? "INVOICE_REFUNDED" : "INVOICE_PARTIALLY_REFUNDED",
          entity: "Invoice",
          entityId: invoice.id,
          metadata: {
            refundInvoiceId: created.id,
            reason: parsed.data.reason,
            total: refundTotal,
            originalInvoiceTotal: Number(invoice.total),
            finalRefundTotal,
            lineCount: selectedLines.length,
          },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({ data: refund }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
