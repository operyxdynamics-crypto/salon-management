import { z } from "zod";

export const bookingSchema = z.object({
  salonId: z.string().min(1),
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().optional(),
  source: z.enum(["MARKETPLACE", "SALON_WEBSITE"]).default("MARKETPLACE"),
  customer: z.object({
    name: z.string().min(2).max(100),
    phone: z.string().regex(/^\+91[6-9]\d{9}$/),
    email: z.email().optional(),
  }),
  startsAt: z.iso.datetime(),
  idempotencyKey: z.string().min(12).max(100),
});

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  payments: z.array(z.object({
    method: z.enum(["CASH", "CARD", "UPI", "GIFT_CARD", "PACKAGE", "LOYALTY"]),
    amount: z.number().positive(),
    reference: z.string().max(100).optional(),
  })).min(1),
  idempotencyKey: z.string().min(12).max(100),
});
