import { db } from "@/lib/db";
import type { InvoiceDocumentData } from "@/lib/invoice-document";

/**
 * Load exactly what the printable invoice needs, server-side.
 *
 * The seller is read from the invoice's own snapshot rather than from the branch as it stands
 * today: a FOFO franchise invoice was issued by the franchisee and must keep saying so even if that
 * branch later converts to company-operated. Same reason `hsnCode` and `taxRate` are stored on the
 * line - a tax invoice is a record of a specific supply on a specific day, not a live view.
 */
export async function loadInvoiceDocumentData(
  invoiceId: string,
  branchIds: string[],
  fallbackSellerName: string,
): Promise<InvoiceDocumentData | null> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, branchId: { in: branchIds } },
    include: {
      branch: { select: { name: true, city: true, address: true, state: true, postalCode: true } },
      customer: { select: { name: true, phone: true, email: true } },
      lines: { include: { staff: { include: { user: { select: { name: true } } } } } },
      payments: { select: { method: true, amount: true, reference: true } },
    },
  });
  if (!invoice) return null;

  const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  return {
    number: invoice.number,
    branch: {
      name: invoice.branch.name,
      city: invoice.branch.city,
      address: invoice.branch.address,
      state: invoice.branch.state,
      postalCode: invoice.branch.postalCode,
    },
    seller: {
      legalName: invoice.supplierName ?? fallbackSellerName,
      gstin: invoice.supplierGstin,
      stateCode: invoice.supplierStateCode,
    },
    placeOfSupplyState: invoice.placeOfSupplyState,
    customer: { name: invoice.customer.name, phone: invoice.customer.phone, email: invoice.customer.email },
    type: invoice.type,
    status: invoice.status,
    taxMode: invoice.taxMode,
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    tax: Number(invoice.tax),
    tip: Number(invoice.tip),
    total: Number(invoice.total),
    paid,
    outstanding: Math.max(0, Number(invoice.total) - paid),
    voidReason: invoice.voidReason,
    createdAt: invoice.createdAt.toISOString(),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      type: line.type,
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discount: Number(line.discount),
      taxRate: Number(line.taxRate),
      hsnCode: line.hsnCode,
      tax: Number(line.tax),
      total: Number(line.total),
      staff: line.staff?.user.name ?? null,
    })),
    payments: invoice.payments.map((payment) => ({
      method: payment.method,
      amount: Number(payment.amount),
      reference: payment.reference,
    })),
  };
}
