import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calculateTaxLine } from "@/lib/billing";

export const saleDraftCartLineSchema = z.object({
  type: z.enum(["SERVICE", "PRODUCT"]),
  itemId: z.string().min(1),
  name: z.string().min(1).max(200),
  price: z.number().min(0),
  taxRate: z.number().min(0).max(100),
  priceTaxMode: z.enum(["EXCLUSIVE", "INCLUSIVE"]).default("EXCLUSIVE"),
  quantity: z.number().positive(),
  discount: z.number().min(0).default(0),
  staffId: z.string().optional(),
  packagePurchaseId: z.string().optional(),
});

export const saleDraftPaymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "UPI", "GIFT_CARD", "LOYALTY", "WALLET"]),
  amount: z.number().min(0),
  reference: z.string().max(100).optional(),
});

export const saleDraftPayloadSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1).optional(),
  appointmentId: z.string().min(1).optional(),
  title: z.string().trim().max(120).optional(),
  taxMode: z.enum(["GST", "NON_GST"]).default("GST"),
  cart: z.array(saleDraftCartLineSchema).min(1),
  payments: z.array(saleDraftPaymentSchema).default([]),
  tip: z.number().min(0).default(0),
});

export type SaleDraftPayload = z.infer<typeof saleDraftPayloadSchema>;

export function calculateSaleDraftTotal(payload: SaleDraftPayload) {
  const linesTotal = payload.cart.reduce((sum, line) => {
    const base = line.price * line.quantity;
    const discount = Math.min(base, line.packagePurchaseId ? base : line.discount);
    return sum + calculateTaxLine({
      quantity: line.quantity,
      unitPrice: line.price,
      discount,
      taxRate: line.taxRate,
      priceTaxMode: line.priceTaxMode,
      invoiceTaxMode: payload.taxMode,
    }).total;
  }, 0);
  return Number((linesTotal + payload.tip).toFixed(2));
}

export function saleDraftTitle(payload: SaleDraftPayload, customerName?: string | null) {
  if (payload.title?.trim()) return payload.title.trim();
  return customerName ? `${customerName} sale` : "Held counter sale";
}

type SaleDraftWithRelations = Prisma.SaleDraftGetPayload<{
  include: {
    customer: { select: { id: true; name: true; phone: true; email: true; notes: true; allergies: true } };
    appointment: { select: { id: true; startsAt: true; status: true } };
    createdBy: { select: { id: true; name: true } };
  };
}>;

export const saleDraftInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true, notes: true, allergies: true } },
  appointment: { select: { id: true, startsAt: true, status: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SaleDraftInclude;

export function serializeSaleDraft(draft: SaleDraftWithRelations) {
  return {
    id: draft.id,
    branchId: draft.branchId,
    customerId: draft.customerId,
    appointmentId: draft.appointmentId,
    title: draft.title,
    taxMode: draft.taxMode,
    cart: draft.cart,
    payments: draft.payments,
    tip: Number(draft.tip),
    total: Number(draft.total),
    status: draft.status,
    customer: draft.customer,
    appointment: draft.appointment ? {
      id: draft.appointment.id,
      startsAt: draft.appointment.startsAt.toISOString(),
      status: draft.appointment.status,
    } : null,
    createdBy: draft.createdBy ? { id: draft.createdBy.id, name: draft.createdBy.name } : null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}
