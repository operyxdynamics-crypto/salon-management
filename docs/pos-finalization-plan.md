# POS Finalization Plan

Date: 2026-07-14
Scope: Milestone 2 in `docs/PROJECT_STATUS.md` — "Finish POS refunds, voids, held sales, and invoice reversal clarity."

## What already exists (read from code, not from status docs)

`PROJECT_STATUS.md` understates the current state. These are already implemented:

- Held/draft sales: `SaleDraft` model, `/api/v1/operations/sale-drafts`, hold + restore UI in `billing.tsx`.
- Partial line-level refunds: `refundLineSchema`, per-line remaining-quantity tracking via `InvoiceLine.refundSourceLineId`, credit-note invoice (`type: REFUND`, `CRN-` numbering).
- Reversal logic: product restock, service-recipe stock is *not* reversed, commission reversal, wallet restore, gift card restore, loyalty earn reversal + redeem restore, package balance restore.
- Reversal preview UI: client-side text notes in `InvoicePreview`.

So this milestone is **not** "build refunds" — it is "make the existing refund/void engine correct, provable, and honest in the UI."

---

## P0 — Correctness bugs (money-affecting)

### Bug 1: Double refund on mixed-tender invoices

`src/app/api/v1/operations/invoices/[invoiceId]/refund/route.ts`

The refund creates a payment record for the **full refund total** in the operator-chosen method:

```ts
payments: { create: { method: refundData.method, amount: refundTotal, reference: refundData.reference } }
```

…and then **separately** restores non-cash tenders pro-rata:

```ts
for (const payment of invoice.payments) {
  const amount = money(Number(payment.amount) * refundRatio);
  if (payment.method === "WALLET")   { customer.walletBalance += amount }
  if (payment.method === "GIFT_CARD"){ giftCard.balance += amount }
}
// plus LOYALTY_REDEEM restore in the benefits loop
```

**Result:** an invoice paid ₹500 wallet + ₹500 cash, refunded in full, returns ₹1000 cash **and** ₹500 to the wallet. The salon loses ₹500 per occurrence.

**Fix — tender-aware refund allocation.** The refund must be split across the original tenders:

1. Compute `refundTotal`.
2. Allocate against original payments in a fixed priority: restore restricted tenders first (`WALLET`, `GIFT_CARD`, `LOYALTY`), capped at each tender's remaining un-refunded amount.
3. Whatever remains is refunded in cash-equivalent (`CASH` / `CARD` / `UPI` — the operator's `method`).
4. Create a `PaymentRecord` on the credit note for **each** allocated tender (negative-cash refunds are represented as separate rows on the REFUND invoice), and only run the wallet/gift/loyalty restore for the amount actually allocated to that tender.

Track cumulative per-tender refunds so a second partial refund cannot over-restore. Add `PaymentRecord.sourcePaymentId` (self-relation) so each refund payment row points at the original tender row it reverses. This makes "how much of this wallet payment is already refunded" a query, not a ratio guess.

### Bug 2: Void is unreachable dead code

Checkout always writes `status: "PAID"` with payments summing to `total`. The void guard is:

```ts
if (paid > 0) throw new OperationsError("CONFLICT", "Paid invoices must be refunded instead of voided", 409);
```

…and the UI mirrors it: `canVoid = detail.type === "SALE" && detail.paid === 0`. So the Void button never renders and the branch never executes.

**Fix — define a real void.** Void = "this invoice should never have existed" (wrong customer, duplicate bill, test entry), allowed only when **all** hold:

- Invoice is `SALE` and not already `VOID` / `REFUNDED` / `PARTIALLY_REFUNDED`.
- Invoice was created in the **currently open register session** for that branch (no voiding across a closed day — that must be a credit note, for GST integrity).
- Actor holds an elevated permission (`sale:void`, owner/manager only — receptionist gets refund, not void).
- No refund invoice already exists against it.

A void performs a **complete** reversal in one transaction — restock products, restore service-recipe consumption, delete/negate commissions, restore wallet/gift card/loyalty/package, unlink the appointment (revert `COMPLETED` → `CHECKED_IN`), set `status: VOID`, keep the invoice number reserved (never reuse), write an audit log. No credit note is generated. Anything outside the open register window is refused with a message pointing the user at Refund.

### Bug 3: Rounding leaks in reversal

- `Math.max(1, Math.round(points * refundRatio))` restores a minimum of 1 loyalty point even on a ₹1 refund of a 5000-point invoice.
- Package restore is parsed out of a **string note** (`packageRedemptionFromNote`) — fragile and unindexed.
- Service-consumption stock (`SERVICE_CONSUMPTION` recipe movements) is never reversed on refund, so a refunded haircut permanently consumes the colour/shampoo.

**Fix:** proportional rounding with a last-line remainder sweep; replace note-parsing with structured columns on `BenefitTransaction` (`packagePurchaseId`, `serviceId`, `quantity`); add an explicit `restockConsumables` flag (default **false** — consumables really were used) so the behaviour is a decision, not an omission.

---

## P1 — Reversal preview must come from the server

Today `InvoicePreview` builds the preview from client-side guesses ("Wallet redemption will be restored"). It never shows amounts, and after Bug 1 is fixed the allocation logic is too complex to duplicate in the browser.

**Add `POST /api/v1/operations/invoices/[invoiceId]/refund/preview`** (or `?dryRun=true` on the existing route — same code path, wrapped in a transaction that rolls back). It accepts the identical payload and returns:

```jsonc
{
  "refundTotal": 1180,
  "creditNoteNumber": "CRN-GST-…(preview)",
  "tenders": [
    { "method": "WALLET",    "amount": 500, "target": "Customer wallet",       "remainingAfter": 500 },
    { "method": "GIFT_CARD", "amount": 200, "target": "GC-8842",               "remainingAfter": 200 },
    { "method": "CASH",      "amount": 480, "target": "Cash drawer (register)" }
  ],
  "stock":       [{ "item": "Shampoo 200ml", "quantity": 1, "action": "RESTOCK" }],
  "commissions": [{ "staff": "Priya",  "amount": -120 }],
  "loyalty":     { "earnReversed": -47, "redeemRestored": 100 },
  "packages":    [{ "package": "Gold 5x Facial", "usesRestored": 1 }],
  "warnings":    ["Consumables used for this service will not be returned to stock."]
}
```

The confirm dialog renders exactly this — real numbers, no prose guesses. The same shape backs the void preview (`action: "VOID"`).

## P1 — Held sales hardening

- Add `expiresAt` + a status of `EXPIRED`; drafts older than N days (branch setting, default 7) are swept and excluded from the held list.
- Block checkout of a draft whose cart prices/stock have drifted: re-price on restore and show a diff banner ("Hair spa was ₹1200, now ₹1400").
- Delete the draft on successful checkout (currently `activeDraftId` is cleared client-side; confirm the server row is discarded).

## P2 — POS polish

- Coupon/discount codes at cart level (schema: `Coupon`, `CouponRedemption`) — currently only per-line manual discount.
- Barcode input on the product tab (keyboard-wedge scanner focus trap).
- Checkout validation copy: split-payment shortfall/overage banner with exact ₹ difference.

---

## Schema changes (one migration)

```prisma
model PaymentRecord {
  // …existing
  sourcePaymentId String?
  sourcePayment   PaymentRecord?  @relation("PaymentRefunds", fields: [sourcePaymentId], references: [id], onDelete: SetNull)
  refundPayments  PaymentRecord[] @relation("PaymentRefunds")
  @@index([sourcePaymentId])
}

model BenefitTransaction {
  // …existing
  packagePurchaseId String?
  serviceId         String?
  quantity          Decimal? @db.Decimal(10, 2)
}

model SaleDraft {
  // …existing
  expiresAt DateTime?
}

enum SaleDraftStatus { /* …existing */ EXPIRED }
enum PermissionKey  { /* wherever sale:write lives */ sale:void }
```

Backfill: existing `PACKAGE_REDEEM` rows keep working via the legacy note parser (kept as a fallback for one release), and a one-shot script populates the new columns from the note string.

## API surface after this milestone

| Method | Path | Change |
| --- | --- | --- |
| POST | `/operations/invoices/[id]/refund` | Tender-aware allocation, real VOID branch, `restockConsumables` flag |
| POST | `/operations/invoices/[id]/refund/preview` | **New** — dry-run, returns full reversal breakdown |
| GET | `/operations/invoices/[id]` | Adds `tenderRefundState` (per-payment refunded/remaining) |
| GET/POST/PATCH/DELETE | `/operations/sale-drafts` | Adds expiry sweep + re-price on restore |

## Tests (Vitest, `src/lib/refund.test.ts`)

Pure functions extracted to `src/lib/refund.ts` so they are testable without a DB:

- `allocateRefundTenders()` — cash-only, wallet+cash, gift+loyalty+cash, over-refund guard, second partial refund respects prior allocation.
- `proportionalReversal()` — no minimum-1-point leak; remainders sum exactly to the whole.
- `lineRefundAmounts()` — ratio math on discounted/inclusive-tax lines.
- `canVoidInvoice()` — register-window + role + no-prior-refund guards.

Target: refund/void math has ≥ 20 assertions before any UI work lands.

## Suggested build order

1. Extract `src/lib/refund.ts` + tests (no behavior change yet). — *pure, safe*
2. Migration for `sourcePaymentId`, benefit columns, draft expiry, `sale:void`.
3. Rewrite refund route to use tender allocation; fix rounding; reverse consumables behind a flag.
4. Implement real VOID (register-window guard).
5. Preview endpoint.
6. Rewire `InvoicePreview` confirm dialog to server preview.
7. Held-sale expiry + re-price.
8. Browser QA script + update `PROJECT_STATUS.md`.

Steps 1–2 are independent; 3–6 are sequential. Each step ends with `npm run lint && npm run typecheck && npm test && npm run build`.
