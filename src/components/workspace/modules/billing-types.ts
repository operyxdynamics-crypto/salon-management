import type { CustomerChoice } from "@/components/workspace/customer/types";

export type CartLine = { type: "SERVICE" | "PRODUCT"; itemId: string; name: string; price: number; taxRate: number; priceTaxMode: "EXCLUSIVE" | "INCLUSIVE"; quantity: number; discount: number; staffId?: string; packagePurchaseId?: string };

export type SalePaymentDraft = { method: "UPI" | "CARD" | "CASH" | "GIFT_CARD" | "LOYALTY" | "WALLET"; amount: number; reference?: string };

export type MobilePosSheetName = "customer" | "items" | "payment" | "held" | null;

export type HeldSale = {
  id: string;
  branchId: string;
  customerId: string | null;
  appointmentId: string | null;
  title: string;
  taxMode: "GST" | "NON_GST";
  cart: CartLine[];
  payments: SalePaymentDraft[];
  tip: number;
  total: number;
  status: string;
  customer: CustomerChoice | null;
  appointment: { id: string; startsAt: string; status: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};
