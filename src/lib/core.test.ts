import { describe, expect, it } from "vitest";
import { calculateInvoice, paymentTotal, resolveServiceSalePricing } from "./billing";
import { can } from "./rbac";
import { bookingSchema } from "./validation";

describe("tenant role permissions", () => {
  it("allows owners to manage inventory but not moderate the platform", () => {
    expect(can("OWNER", "inventory:write")).toBe(true);
    expect(can("OWNER", "marketplace:moderate")).toBe(false);
  });

  it("limits customers to their own records and booking", () => {
    expect(can("CUSTOMER", "self:read")).toBe(true);
    expect(can("CUSTOMER", "report:read")).toBe(false);
  });
});

describe("booking input", () => {
  it("accepts an India phone number and idempotency key", () => {
    const result = bookingSchema.safeParse({
      salonId: "tenant_1",
      branchId: "branch_1",
      serviceId: "service_1",
      customer: { name: "Ananya Rao", phone: "+919876543210" },
      startsAt: "2026-06-12T10:00:00.000Z",
      idempotencyKey: "booking-test-001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid phone numbers", () => {
    const result = bookingSchema.safeParse({
      salonId: "tenant_1",
      branchId: "branch_1",
      serviceId: "service_1",
      customer: { name: "Ananya Rao", phone: "1234" },
      startsAt: "2026-06-12T10:00:00.000Z",
      idempotencyKey: "booking-test-002",
    });
    expect(result.success).toBe(false);
  });
});

describe("invoice calculations", () => {
  it("uses branch service price and tax overrides at checkout", () => {
    const pricing = resolveServiceSalePricing(
      { price: 1800, taxRate: 18, priceTaxMode: "EXCLUSIVE", isActive: true },
      { price: 2050, taxRate: 18, priceTaxMode: "EXCLUSIVE", isActive: true },
    );
    expect(pricing).toEqual({ price: 2050, taxRate: 18, priceTaxMode: "EXCLUSIVE", isActive: true });
    expect(calculateInvoice([{ quantity: 1, unitPrice: pricing.price, taxRate: pricing.taxRate }])).toEqual({
      subtotal: 2050,
      discount: 0,
      tax: 369,
      tip: 0,
      total: 2419,
    });
  });

  it("calculates discounts, GST, tips, and split payments", () => {
    const invoice = calculateInvoice([
      { quantity: 1, unitPrice: 1200, discount: 100, taxRate: 18 },
      { quantity: 2, unitPrice: 500, taxRate: 18 },
    ], 100);
    expect(invoice).toEqual({
      subtotal: 2200,
      discount: 100,
      tax: 378,
      tip: 100,
      total: 2578,
    });
    expect(paymentTotal([{ amount: 1000 }, { amount: 1578 }])).toBe(invoice.total);
  });

  it("keeps GST-inclusive prices fixed while extracting the tax component", () => {
    expect(calculateInvoice([
      { quantity: 1, unitPrice: 999, taxRate: 18, priceTaxMode: "INCLUSIVE" },
      { quantity: 1, unitPrice: 550, taxRate: 18, priceTaxMode: "EXCLUSIVE" },
    ])).toEqual({
      subtotal: 1549,
      discount: 0,
      tax: 251.39,
      tip: 0,
      total: 1648,
    });
  });

  it("does not add or extract GST on a non-GST invoice", () => {
    expect(calculateInvoice([
      { quantity: 1, unitPrice: 999, taxRate: 18, priceTaxMode: "INCLUSIVE" },
    ], 0, "NON_GST")).toEqual({
      subtotal: 999,
      discount: 0,
      tax: 0,
      tip: 0,
      total: 999,
    });
  });
});
