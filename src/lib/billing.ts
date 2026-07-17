export type BillLine = {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate: number;
  priceTaxMode?: TaxPricingMode;
};

export type TaxPricingMode = "EXCLUSIVE" | "INCLUSIVE";
export type InvoiceTaxModeValue = "GST" | "NON_GST";

export type ServiceSalePricing = {
  price: number;
  taxRate: number;
  priceTaxMode: TaxPricingMode;
  isActive: boolean;
};

export function resolveServiceSalePricing(
  master: ServiceSalePricing,
  branch?: { price?: number | null; taxRate?: number | null; priceTaxMode?: TaxPricingMode | null; isActive: boolean } | null,
) {
  return {
    price: branch?.price ?? master.price,
    taxRate: branch?.taxRate ?? master.taxRate,
    priceTaxMode: branch?.priceTaxMode ?? master.priceTaxMode,
    isActive: master.isActive && (branch?.isActive ?? true),
  };
}

export function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export function calculateTaxLine({
  quantity,
  unitPrice,
  discount = 0,
  taxRate,
  priceTaxMode = "EXCLUSIVE",
  invoiceTaxMode = "GST",
}: BillLine & { invoiceTaxMode?: InvoiceTaxModeValue }) {
  const subtotal = roundMoney(quantity * unitPrice);
  const appliedDiscount = roundMoney(Math.min(subtotal, Math.max(0, discount)));
  const afterDiscount = roundMoney(Math.max(0, subtotal - appliedDiscount));
  if (invoiceTaxMode === "NON_GST" || taxRate <= 0) {
    return { subtotal, discount: appliedDiscount, taxable: afterDiscount, tax: 0, total: afterDiscount };
  }
  if (priceTaxMode === "INCLUSIVE") {
    const tax = roundMoney(afterDiscount * taxRate / (100 + taxRate));
    return { subtotal, discount: appliedDiscount, taxable: roundMoney(afterDiscount - tax), tax, total: afterDiscount };
  }
  const tax = roundMoney(afterDiscount * taxRate / 100);
  return { subtotal, discount: appliedDiscount, taxable: afterDiscount, tax, total: roundMoney(afterDiscount + tax) };
}

export function displayPrice(unitPrice: number, taxRate: number, priceTaxMode: TaxPricingMode, invoiceTaxMode: InvoiceTaxModeValue = "GST") {
  return calculateTaxLine({ quantity: 1, unitPrice, taxRate, priceTaxMode, invoiceTaxMode }).total;
}

export function calculateInvoice(lines: BillLine[], tip = 0, invoiceTaxMode: InvoiceTaxModeValue = "GST") {
  const calculated = lines.map((line) => calculateTaxLine({ ...line, invoiceTaxMode }));
  const subtotal = roundMoney(calculated.reduce((sum, line) => sum + line.subtotal, 0));
  const discount = roundMoney(calculated.reduce((sum, line) => sum + line.discount, 0));
  const tax = roundMoney(calculated.reduce((sum, line) => sum + line.tax, 0));
  return {
    subtotal,
    discount,
    tax,
    tip,
    total: roundMoney(calculated.reduce((sum, line) => sum + line.total, 0) + tip),
  };
}

export function paymentTotal(payments: Array<{ amount: number }>) {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}
