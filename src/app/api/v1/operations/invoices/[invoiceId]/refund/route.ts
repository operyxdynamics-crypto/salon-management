import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("REFUND"),
    branchId: z.string().min(1),
    reason: z.string().min(3).max(300),
    method: z.enum(["CASH", "CARD", "UPI"]).default("CASH"),
    reference: z.string().max(100).optional(),
    restockProducts: z.boolean().default(true),
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
  const quantity = Number(note.match(/quantity=([^|]+)/)?.[1] ?? 0);
  return packagePurchaseId && serviceId && quantity > 0 ? { packagePurchaseId, serviceId, quantity } : null;
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
      include: { lines: true, payments: true },
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
          subtotal: invoice.subtotal,
          discount: invoice.discount,
          tax: invoice.tax,
          taxMode: invoice.taxMode,
          tip: invoice.tip,
          total: invoice.total,
          status: "PAID",
          type: "REFUND",
          voidReason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
          lines: {
            create: invoice.lines.map((line) => ({
              type: line.type,
              description: `Refund: ${line.description}`,
              serviceId: line.serviceId,
              inventoryItemId: line.inventoryItemId,
              staffId: line.staffId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              taxRate: line.taxRate,
              tax: line.tax,
              total: line.total,
            })),
          },
          payments: { create: { method: refundData.method, amount: invoice.total, reference: refundData.reference } },
        },
        include: { lines: true, payments: true },
      });

      if (refundData.restockProducts) {
        for (const line of invoice.lines.filter((item) => item.type === "PRODUCT" && item.inventoryItemId)) {
          await tx.branchStock.upsert({
            where: { branchId_inventoryItemId: { branchId: branch.id, inventoryItemId: line.inventoryItemId! } },
            update: { quantity: { increment: line.quantity } },
            create: { branchId: branch.id, inventoryItemId: line.inventoryItemId!, quantity: line.quantity },
          });
          await tx.stockMovement.create({
            data: {
              branchId: branch.id,
              inventoryItemId: line.inventoryItemId!,
              type: "REFUND_RETURN",
              quantity: line.quantity,
              reference: created.number,
              idempotencyKey: `${parsed.data.idempotencyKey}-return-${line.inventoryItemId}`,
            },
          });
        }
      }

      for (const line of invoice.lines.filter((item) => item.type === "SERVICE" && item.staffId)) {
        const commission = await tx.commission.findFirst({ where: { staffId: line.staffId!, source: "INVOICE", sourceId: invoice.id } });
        if (commission && Number(commission.amount) > 0) {
          await tx.commission.create({
            data: {
              staffId: line.staffId!,
              amount: -Number(commission.amount),
              source: "REFUND",
              sourceId: created.id,
              idempotencyKey: `${parsed.data.idempotencyKey}-commission-${line.id}`,
            },
          });
        }
      }
      for (const payment of invoice.payments) {
        const amount = Number(payment.amount);
        if (amount <= 0) continue;
        if (payment.method === "WALLET") {
          await tx.customer.update({ where: { id: invoice.customerId }, data: { walletBalance: { increment: amount } } });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "WALLET_REFUND",
              sourceType: "REFUND",
              sourceId: created.id,
              amount,
              note: `Restored from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-wallet-refund-${payment.id}`,
            },
          });
        }
        if (payment.method === "GIFT_CARD" && payment.reference) {
          const card = await tx.giftCard.findFirst({
            where: { tenantId: context.tenant.id, OR: [{ id: payment.reference }, { code: payment.reference }] },
          });
          if (card) {
            await tx.giftCard.update({ where: { id: card.id }, data: { balance: { increment: amount }, status: "ACTIVE" } });
            await tx.benefitTransaction.create({
              data: {
                tenantId: context.tenant.id,
                branchId: branch.id,
                customerId: invoice.customerId,
                kind: "GIFT_CARD_REFUND",
                sourceType: "REFUND",
                sourceId: created.id,
                amount,
                note: `Restored ${card.code} from ${invoice.number}`,
                idempotencyKey: `${parsed.data.idempotencyKey}-gift-refund-${payment.id}`,
              },
            });
          }
        }
      }
      for (const benefit of originalBenefits) {
        if (benefit.kind === "LOYALTY_REDEEM" && benefit.points && benefit.points < 0) {
          const points = Math.abs(benefit.points);
          await tx.loyaltyLedger.create({ data: { customerId: invoice.customerId, points, reason: `Refund restored redemption ${number}` } });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "LOYALTY_REFUND",
              sourceType: "REFUND",
              sourceId: created.id,
              amount: benefit.amount,
              points,
              note: `Restored from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-loyalty-redeem-${benefit.id}`,
            },
          });
        }
        if (benefit.kind === "LOYALTY_EARN" && benefit.points && benefit.points > 0) {
          await tx.loyaltyLedger.create({ data: { customerId: invoice.customerId, points: -benefit.points, reason: `Refund reversed earn ${number}` } });
          await tx.benefitTransaction.create({
            data: {
              tenantId: context.tenant.id,
              branchId: branch.id,
              customerId: invoice.customerId,
              kind: "LOYALTY_REVERSAL",
              sourceType: "REFUND",
              sourceId: created.id,
              points: -benefit.points,
              note: `Reversed earn from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-loyalty-earn-${benefit.id}`,
            },
          });
        }
        if (benefit.kind === "PACKAGE_REDEEM") {
          const redemption = packageRedemptionFromNote(benefit.note);
          if (!redemption) continue;
          const purchase = await tx.packagePurchase.findUnique({ where: { id: redemption.packagePurchaseId } });
          if (!purchase) continue;
          const balance = packageBalanceLines(purchase.balance);
          const serviceExists = balance.some((item) => item.serviceId === redemption.serviceId);
          const nextBalance = serviceExists
            ? balance.map((item) => item.serviceId === redemption.serviceId ? { ...item, quantity: item.quantity + redemption.quantity } : item)
            : [...balance, { serviceId: redemption.serviceId, quantity: redemption.quantity }];
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
              amount: benefit.amount,
              note: `Restored ${redemption.quantity} use(s) from ${invoice.number}`,
              idempotencyKey: `${parsed.data.idempotencyKey}-package-${benefit.id}`,
            },
          });
        }
      }
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "REFUNDED", voidReason: parsed.data.reason } });
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "INVOICE_REFUNDED",
          entity: "Invoice",
          entityId: invoice.id,
          metadata: { refundInvoiceId: created.id, reason: parsed.data.reason, total: Number(invoice.total) },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({ data: refund }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
