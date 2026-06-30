export type BillLine = {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate: number;
};

export function calculateInvoice(lines: BillLine[], tip = 0) {
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const discount = lines.reduce((sum, line) => sum + (line.discount ?? 0), 0);
  const tax = lines.reduce((sum, line) => {
    const taxable = line.quantity * line.unitPrice - (line.discount ?? 0);
    return sum + taxable * (line.taxRate / 100);
  }, 0);
  return {
    subtotal,
    discount,
    tax,
    tip,
    total: subtotal - discount + tax + tip,
  };
}

export function paymentTotal(payments: Array<{ amount: number }>) {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}
