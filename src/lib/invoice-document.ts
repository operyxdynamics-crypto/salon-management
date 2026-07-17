import { inr } from "@/lib/format";
import { splitGst, stateCodeForState } from "@/lib/gst";

/**
 * The printable invoice.
 *
 * Kept out of the React tree on purpose: this is a document, not a screen. It renders to a string
 * of self-contained HTML so it can be opened in a print window, saved as a PDF by the browser, or
 * later handed to a server-side renderer without dragging component code along.
 *
 * Two things shape every decision here:
 *
 * 1. It is a legal record. An Indian tax invoice must show the supplier's name and GSTIN, the place
 *    of supply, HSN/SAC per line, and the tax split as CGST+SGST (intra-state) or IGST
 *    (inter-state). None of that is decoration, so none of it is dropped to make the page prettier.
 * 2. It gets printed. Paper is A4 or A5, so the layout is driven by `@page` and a type scale rather
 *    than a screen breakpoint, and large areas of solid colour are avoided - they drain a cartridge
 *    and look worse on paper than they do on screen.
 */

export type PaperSize = "A4" | "A5";

export type InvoiceDocumentData = {
  number: string;
  branch: { name: string; city?: string | null; address?: string | null; state?: string | null; postalCode?: string | null };
  seller?: { legalName: string; gstin: string | null; stateCode?: string | null };
  placeOfSupplyState?: string | null;
  customer: { name: string; phone: string; email: string | null };
  type: string;
  status: string;
  taxMode: string;
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  total: number;
  paid: number;
  outstanding: number;
  voidReason: string | null;
  createdAt: string;
  lines: Array<{
    id: string;
    type: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
    hsnCode?: string | null;
    tax: number;
    total: number;
    staff: string | null;
  }>;
  payments: Array<{ method: string; amount: number; reference: string | null }>;
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

function titleCase(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStamp(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

/**
 * A4 is the filing copy, A5 the counter copy handed to the customer.
 *
 * A5 prints landscape: an invoice line is a wide row - description, HSN/SAC, qty, price, discount,
 * tax, total - and portrait A5 is only 148mm across, which squeezes those columns until the numbers
 * wrap. Turned on its side, A5 is exactly as wide as A4 portrait, so the same table fits honestly
 * on half the paper.
 */
const PAPER: Record<PaperSize, {
  orientation: "portrait" | "landscape";
  width: string; height: string;
  margin: string; base: string; display: string; gap: string; cell: string;
}> = {
  A4: { orientation: "portrait", width: "210mm", height: "297mm", margin: "12mm", base: "10.5pt", display: "30pt", gap: "18px", cell: "9px 10px" },
  A5: { orientation: "landscape", width: "210mm", height: "148mm", margin: "8mm", base: "8.5pt", display: "20pt", gap: "10px", cell: "5px 7px" },
};

export function renderInvoiceDocument(invoice: InvoiceDocumentData, paper: PaperSize = "A4"): string {
  const scale = PAPER[paper];
  const isGst = invoice.taxMode === "GST";
  const isRefund = invoice.type === "REFUND";
  const isVoid = invoice.status === "VOID";

  // Derived from the invoice's own snapshot, never assumed. A salon serving customers on its
  // premises is intra-state - but that is a consequence of the data, not a hardcoded truth.
  const supplierStateCode = invoice.seller?.stateCode ?? null;
  const placeOfSupplyCode = invoice.placeOfSupplyState ? stateCodeForState(invoice.placeOfSupplyState) : null;
  const split = isGst && supplierStateCode && placeOfSupplyCode
    ? splitGst(invoice.tax, supplierStateCode, placeOfSupplyCode)
    : null;
  const isIntraState = !split || split.kind === "INTRA_STATE";

  const docTitle = isRefund ? "Credit Note" : isGst ? "Tax Invoice" : "Bill of Supply";
  const taxable = invoice.subtotal - invoice.discount;

  const address = [invoice.branch.address, invoice.branch.city, invoice.branch.state, invoice.branch.postalCode].filter(Boolean).join(", ");

  const rows = invoice.lines.map((line, index) => {
    const lineSplit = isGst && supplierStateCode && placeOfSupplyCode
      ? splitGst(line.tax, supplierStateCode, placeOfSupplyCode)
      : null;
    const taxCell = !isGst
      ? `<td class="num">${line.taxRate}%</td>`
      : lineSplit && lineSplit.kind === "INTRA_STATE"
        ? `<td class="num">${line.taxRate}%<span class="sub">${inr.format(lineSplit.cgst)} + ${inr.format(lineSplit.sgst)}</span></td>`
        : `<td class="num">${line.taxRate}%<span class="sub">IGST ${inr.format(line.tax)}</span></td>`;
    const meta = [titleCase(line.type), line.staff ? `with ${line.staff}` : null].filter(Boolean).join(" · ");
    // HSN/SAC earns its own column: it is a rate-bearing classification an auditor reads down the
    // page, not a footnote about the item.
    const hsnCell = isGst
      ? `<td class="code${line.hsnCode ? "" : " missing"}">${escapeHtml(line.hsnCode || "Not set")}</td>`
      : "";
    return `<tr>
      <td class="idx">${index + 1}</td>
      <td><span class="item">${escapeHtml(line.description)}</span><span class="sub">${escapeHtml(meta)}</span></td>
      ${hsnCell}
      <td class="num">${line.quantity}</td>
      <td class="num">${inr.format(line.unitPrice)}</td>
      <td class="num">${line.discount ? `−${inr.format(line.discount)}` : "—"}</td>
      ${taxCell}
      <td class="num strong">${inr.format(line.total)}</td>
    </tr>`;
  }).join("");

  const totalRow = (label: string, value: string, klass = "") => `<tr class="${klass}"><td>${label}</td><td class="num">${value}</td></tr>`;

  const taxRows = isGst
    ? isIntraState
      ? totalRow("CGST", inr.format(split ? split.cgst : invoice.tax / 2)) + totalRow("SGST", inr.format(split ? split.sgst : invoice.tax / 2))
      : totalRow("IGST", inr.format(invoice.tax))
    : totalRow("Tax", inr.format(invoice.tax));

  const payments = invoice.payments.length
    ? invoice.payments.map((payment) => `<li><span>${escapeHtml(titleCase(payment.method))}${payment.reference ? ` · ${escapeHtml(payment.reference)}` : ""}</span><strong>${inr.format(payment.amount)}</strong></li>`).join("")
    : `<li><span>No payment recorded</span><strong>—</strong></li>`;

  // Say it on the invoice rather than only in the app: a bill with no GSTIN or a missing HSN is not
  // a valid tax invoice, and the person printing it is the one who can still fix it.
  const warnings: string[] = [];
  if (isGst && !invoice.seller?.gstin) warnings.push("No supplier GSTIN on this invoice. Add the registration in Settings → Branch.");
  if (isGst && invoice.lines.some((line) => !line.hsnCode)) warnings.push("Some lines have no HSN/SAC code. Set a tax class on every service and product.");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(invoice.number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: ${paper} ${scale.orientation}; margin: ${scale.margin}; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #EFEAF3; color: #1F2937;
    font-family: Inter, "Segoe UI", Arial, sans-serif; font-size: ${scale.base}; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet { width: ${scale.width}; min-height: ${scale.height};
    margin: 16px auto; background: #FFFFFF; padding: ${scale.margin}; box-shadow: 0 18px 60px rgba(31,41,55,.18); }

  /* Header: the salon's name carries the page, the way a letterhead does. */
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: ${scale.gap};
    padding-bottom: ${scale.gap}; border-bottom: 2px solid #5B2A86; }
  .wordmark { font-family: "Playfair Display", Georgia, serif; font-size: ${scale.display}; font-weight: 600;
    color: #5B2A86; line-height: 1.05; margin: 0; }
  .doctype { margin: 4px 0 0; letter-spacing: .18em; text-transform: uppercase; font-size: .82em; font-weight: 600; color: #6B7280; }
  .meta { text-align: right; font-size: .92em; }
  .meta div { display: flex; justify-content: flex-end; gap: 10px; }
  .meta span { color: #6B7280; }
  .meta strong { min-width: 96px; text-align: right; }
  .serial { font-family: "Playfair Display", Georgia, serif; font-size: 1.5em; color: #5B2A86; }

  .parties { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${scale.gap}; margin: ${scale.gap} 0; }
  .label { font-size: .72em; letter-spacing: .14em; text-transform: uppercase; color: #9CA3AF; font-weight: 600; margin: 0 0 3px; }
  .party strong { display: block; font-size: 1.05em; }
  .party p { margin: 2px 0 0; color: #6B7280; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items thead th { background: #F6F2FA; color: #5B2A86; font-size: .72em; letter-spacing: .1em;
    text-transform: uppercase; text-align: left; padding: ${scale.cell}; border-bottom: 1px solid #E3D9EE; }
  table.items td { padding: ${scale.cell}; border-bottom: 1px solid #EFEAF3; vertical-align: top; }
  .idx { color: #9CA3AF; width: 5%; }
  .item { font-weight: 600; }
  .sub { display: block; color: #9CA3AF; font-size: .82em; }
  .num { text-align: right; white-space: nowrap; }
  .num .sub { text-align: right; }
  .strong { font-weight: 700; }
  /* A classification code, so it is set in tabular figures and never wraps mid-code. */
  .code { font-variant-numeric: tabular-nums; letter-spacing: .02em; white-space: nowrap; }
  .code.missing { color: #C4403E; font-style: italic; }

  .foot { display: grid; grid-template-columns: 1fr auto; gap: ${scale.gap}; margin-top: ${scale.gap}; }
  .pay { list-style: none; margin: 6px 0 0; padding: 0; max-width: 62mm; }
  .pay li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-bottom: 1px dotted #E5E7EB; }
  table.totals { border-collapse: collapse; min-width: ${paper === "A4" ? "72mm" : "58mm"}; }
  table.totals td { padding: 4px 0 4px 18px; }
  table.totals td:first-child { color: #6B7280; }
  table.totals tr.rule td { border-top: 1px solid #E5E7EB; }
  table.totals tr.grand td { border-top: 2px solid #5B2A86; padding-top: 7px; font-size: 1.28em;
    font-weight: 700; color: #5B2A86; font-family: "Playfair Display", Georgia, serif; }
  table.totals tr.due td { color: #C4403E; font-weight: 700; }

  .note { margin-top: ${scale.gap}; padding: 8px 10px; border-left: 3px solid #E9C2B9; background: #FFF6F3;
    color: #984F43; font-size: .86em; }
  .thanks { margin-top: ${scale.gap}; padding-top: ${scale.gap}; border-top: 1px solid #EFEAF3;
    display: flex; justify-content: space-between; align-items: flex-end; gap: ${scale.gap}; }
  .thanks h2 { font-family: "Playfair Display", Georgia, serif; font-style: italic; font-weight: 500;
    color: #5B2A86; margin: 0; font-size: 1.6em; }
  .thanks p { margin: 0; color: #9CA3AF; font-size: .84em; text-align: right; }
  .stamp { margin: 0 0 ${scale.gap}; padding: 5px 10px; display: inline-block; border-radius: 3px;
    font-weight: 700; letter-spacing: .1em; text-transform: uppercase; font-size: .78em;
    background: #FDECEC; color: #94302E; border: 1px solid #F0C4C2; }

  .actions { text-align: center; padding: 10px; }
  .actions button { font: inherit; font-weight: 600; cursor: pointer; margin: 0 4px; padding: 8px 16px;
    border-radius: 999px; border: 1px solid #5B2A86; background: #5B2A86; color: #fff; }
  .actions a { font: inherit; color: #5B2A86; margin-left: 8px; }

  @media print {
    body { background: #fff; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
    .actions { display: none; }
    tr { break-inside: avoid; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
<div class="actions">
  <button onclick="window.print()">Print / Save as PDF (${paper})</button>
</div>
<main class="sheet">
  <header class="head">
    <div>
      <h1 class="wordmark">${escapeHtml(invoice.seller?.legalName || invoice.branch.name)}</h1>
      <p class="doctype">${escapeHtml(docTitle)}</p>
    </div>
    <div class="meta">
      <div><span>Invoice</span><strong class="serial">${escapeHtml(invoice.number)}</strong></div>
      <div><span>Date</span><strong>${escapeHtml(formatStamp(invoice.createdAt))}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(titleCase(invoice.status))}</strong></div>
    </div>
  </header>

  ${isVoid ? `<p class="stamp">Void${invoice.voidReason ? ` — ${escapeHtml(invoice.voidReason)}` : ""}</p>` : ""}
  ${isRefund ? `<p class="stamp">Refund / Credit Note</p>` : ""}

  <section class="parties">
    <div class="party">
      <p class="label">Supplier</p>
      <strong>${escapeHtml(invoice.seller?.legalName || invoice.branch.name)}</strong>
      <p>${escapeHtml(address)}</p>
      ${invoice.seller?.gstin ? `<p><b>GSTIN</b> ${escapeHtml(invoice.seller.gstin)}</p>` : ""}
    </div>
    <div class="party">
      <p class="label">Bill to</p>
      <strong>${escapeHtml(invoice.customer.name)}</strong>
      <p>${escapeHtml(invoice.customer.phone)}</p>
      ${invoice.customer.email ? `<p>${escapeHtml(invoice.customer.email)}</p>` : ""}
    </div>
    <div class="party">
      <p class="label">${isGst ? "Place of supply" : "Branch"}</p>
      <strong>${escapeHtml(invoice.placeOfSupplyState || invoice.branch.state || invoice.branch.name)}</strong>
      <p>${escapeHtml(invoice.branch.name)}</p>
      ${isGst ? `<p>${isIntraState ? "Intra-state · CGST + SGST" : "Inter-state · IGST"}</p>` : ""}
    </div>
  </section>

  <table class="items">
    <thead>
      <tr>
        <th>#</th><th>Description</th>${isGst ? "<th>HSN/SAC</th>" : ""}<th class="num">Qty</th><th class="num">Price</th>
        <th class="num">Discount</th><th class="num">${isGst ? "GST" : "Tax"}</th><th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="foot">
    <div>
      <p class="label">Payment</p>
      <ul class="pay">${payments}</ul>
    </div>
    <table class="totals">
      ${totalRow("Subtotal", inr.format(invoice.subtotal))}
      ${invoice.discount ? totalRow("Discount", `−${inr.format(invoice.discount)}`) : ""}
      ${totalRow("Taxable value", inr.format(taxable), "rule")}
      ${taxRows}
      ${invoice.tip ? totalRow("Tip", inr.format(invoice.tip)) : ""}
      ${totalRow("Total", inr.format(invoice.total), "grand")}
      ${invoice.paid ? totalRow("Paid", inr.format(invoice.paid), "rule") : ""}
      ${invoice.outstanding > 0 ? totalRow("Due", inr.format(invoice.outstanding), "due") : ""}
    </table>
  </section>

  ${warnings.map((warning) => `<p class="note">${escapeHtml(warning)}</p>`).join("")}

  <footer class="thanks">
    <h2>Thank you</h2>
    <p>${escapeHtml(invoice.branch.name)}${invoice.branch.city ? ` · ${escapeHtml(invoice.branch.city)}` : ""}<br>
    This is a computer-generated ${escapeHtml(docTitle.toLowerCase())}.</p>
  </footer>
</main>
</body>
</html>`;
}
