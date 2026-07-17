/**
 * Invoice serial numbers.
 *
 * Two rules drive every decision here:
 *
 * 1. GST caps an invoice serial at 16 characters, and requires it to be unique per supplier per
 *    financial year. So the serial is `CODE/FY/SEQ` - at most 4 + 1 + 4 + 1 + 5 = 15 characters,
 *    or 16 for the non-GST series which carries an extra marker.
 * 2. The branch code is what keeps two branches apart. The old generator took the first four
 *    letters of the branch slug, so "seed-franchise-foco-1" and "seed-franchise-fofo-2" both became
 *    "SEED" and issued the same number - which a globally unique invoice number then rejected.
 *    A branch's code is now stored and unique per salon, never derived at billing time.
 */

export const INVOICE_NUMBER_MAX_LENGTH = 16;
export const INVOICE_CODE_MAX_LENGTH = 4;

export type InvoiceTaxMode = "GST" | "NON_GST";

/**
 * Indian financial year (April to March) as a four-character code: April 2025 - March 2026 → "2526".
 * Four characters rather than "25-26" so the finished serial fits inside the 16-character limit.
 */
export function financialYearCode(date = new Date()): string {
  const india = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const year = india.getFullYear();
  const start = india.getMonth() >= 3 ? year : year - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}

/**
 * Build the serial for a sale. GST and non-GST are separate series for the same branch and year, so
 * the non-GST series carries an "N" - without it, GST #1 and non-GST #1 would be the same string.
 */
export function buildInvoiceNumber(input: {
  code: string;
  financialYear: string;
  taxMode: InvoiceTaxMode;
  sequence: number;
}): string {
  const code = normaliseInvoiceCode(input.code) || "INV";
  const serial = String(input.sequence).padStart(5, "0");
  const marker = input.taxMode === "GST" ? "" : "N";
  return `${code}/${input.financialYear}/${marker}${serial}`;
}

/** Uppercase, strip anything GST does not allow, and cap the length. */
export function normaliseInvoiceCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, INVOICE_CODE_MAX_LENGTH).toUpperCase();
}

/**
 * A readable code from a branch name: initials when the name has several words ("HSR Layout" → HSR,
 * "Whitefield (FOCO)" → WFOC), otherwise the leading letters ("Jayanagar" → JAYA).
 */
export function deriveInvoiceCode(name: string): string {
  const words = name.split(/[^a-z0-9]+/i).filter(Boolean);
  if (words.length > 1) {
    const initials = words.map((word) => word[0]).join("");
    const candidate = normaliseInvoiceCode(initials);
    if (candidate.length >= 2) return candidate;
  }
  return normaliseInvoiceCode(words[0] ?? "") || "INV";
}

/**
 * A code that is not already taken. Falls back to replacing the last character with a counter, so
 * "Whitefield" and "Whitefield 2" cannot both end up as "WHIT".
 */
export function uniqueInvoiceCode(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((code) => code.toUpperCase()));
  const base = deriveInvoiceCode(name);
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const tag = String(suffix);
    const stem = base.slice(0, Math.max(1, INVOICE_CODE_MAX_LENGTH - tag.length));
    const candidate = `${stem}${tag}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Unable to allocate a unique invoice code for "${name}"`);
}
