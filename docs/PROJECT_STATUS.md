# Operyx Project Status

Last updated: 2026-07-14

This file is the master tracker. It is written to be trusted, so it says plainly what is verified,
what is built but unverified, and what does not exist. The previous version overstated the project:
it listed features as pending that were already built (recurring bookings, blocked time, resources,
held sales, partial refunds) and features as complete that had never run. That is worse than having
no document at all.

## How to read this

| Marker | Meaning |
| --- | --- |
| **Verified** | Runs, and someone has watched it work end to end. |
| **Built** | Code exists, lint/typecheck/tests pass, but nobody has exercised it in a browser. |
| **Partial** | Main path works; the named gaps remain. |
| **Not built** | Does not exist. |

Automated checks currently passing: `npm run lint`, `npm run typecheck`, `npm test` — 81 tests
across 5 files (refund allocation, coupon rules, GST rules, billing core, onboarding).

---

## Defects fixed this session

These were live bugs. They are listed first because they matter more than any feature.

### 1. Refunds paid out twice on mixed-tender invoices — **Verified fixed**

The refund created a payment record for the **full** refund total in the operator's chosen method
**and separately** restored wallet / gift card / loyalty pro-rata. An invoice paid ₹500 wallet +
₹500 cash, refunded in full, returned ₹1,000 cash **and** ₹500 to the wallet. The salon lost ₹500
each time.

Fixed by `src/lib/refund.ts` (`allocateRefundTenders`): a refund is split proportionally across the
tenders actually used, capped by what remains un-refunded on each. 21 tests.

### 2. Migration history could not replay on an empty database — **Verified fixed**

`20260612085348_platform_administration` referenced `Invoice."updatedAt"` one migration *before* the
column was created. It only ever worked because the dev database had drifted via `prisma db push`.
**Any fresh deployment would have failed at migration 2.** The statement was moved to where the
column is created; `migrate reset` now replays the full history cleanly.

### 3. `crypto.randomUUID` broke every write over plain HTTP — **Verified fixed**

`crypto.randomUUID()` exists only in a secure context (HTTPS or localhost). Every idempotency key in
the workspace used it, so checkout, refunds, rescheduling, day-close, stock, gift cards and
attendance all threw on any non-TLS origin — LAN testing today, and any deployment without TLS.
Replaced by `newId()` (`src/lib/client-id.ts`), which falls back to `crypto.getRandomValues`.

### 4. The service worker cached authenticated API responses — **Built**

`sw.js` wrote **every** GET into one shared cache, including `/api/v1/operations/*`. One user's
tenant data was readable by the next person to sign in on that device. Rewritten: the API is never
cached, hashed assets are cache-first, pages are network-first with an offline fallback.

### 5. GST invoices were not compliant — **Built**

No HSN/SAC code existed anywhere in the schema and the invoice printed no supplier GSTIN. Both are
legally required. See "GST, legal entities and franchises".

---

## Built this session

### Masters — **Verified**

`Setup > Masters`, grouped Catalogue / Commercial / Suppliers.

- Lookup masters: service categories, product categories, **brands**, **units of measure**,
  **tax classes (HSN/SAC)**, expense categories. One generic table, one API route.
- **Archive, never delete.** Invoices and stock movements point at these rows. The dialog states the
  consequence: *"12 records already use this. They keep it — it just cannot be picked for anything
  new."*
- Usage count per row, so the decision is informed before it is made.
- Migration plus backfill (`prisma/backfill-masters.mjs`), which dedupes existing free-text
  categories case-insensitively and maps units through an alias table.

**Gap:** brands could not be backfilled — the field never existed, so there is nothing to infer
from. Every product starts brandless and must be assigned by hand.

### Coupons — **Verified**

Schema, rules (`src/lib/coupons.ts`, 30 tests), editor in Masters, POS field, checkout redemption,
refund reversal.

- Percent or flat, with a cap ("20% off, up to ₹500"), minimum bill, date window, total usage cap,
  per-customer cap, first-time-customers-only, and restriction to named services, products, or
  categories.
- The discount is **allocated across the lines** before tax, because GST is computed per line. A
  bill-level lump sum would produce the wrong tax.
- The usage cap is enforced **inside the checkout transaction** and re-checked there: two
  receptionists can race for the last use. If it changed during payment, the sale is rejected
  (`COUPON_CHANGED`) rather than silently charged a different total.
- A **full** refund returns the coupon. A partial refund does not — the customer kept part of the
  sale, so they used it.

### GST, legal entities and franchises — **Built**

- `LegalEntity` (COMPANY / FRANCHISEE) and `GstRegistration` — one GSTIN **per state**, because that
  is how GST registration works in India. `Tenant.gstin` is now wrong by construction and is
  deprecated.
- Branches carry `ownershipModel` (**COCO / FOCO / FOFO**), an owner entity, an operator entity, and
  a registration.
- **The operator is the supplier.** That one rule decides whose name and GSTIN goes on every
  invoice. A FOFO franchise bills under its own GSTIN, and its sales are not the company's revenue.
- Checkout **blocks a GST sale** when the branch has no valid registration in its own state, and
  snapshots the supplier onto the invoice.
- Invoices print supplier legal name, GSTIN, **HSN/SAC per line**, and **CGST/SGST** — derived by
  comparing supplier state with place of supply, not assumed.
- `src/lib/gst.ts` — GSTIN format validation, state codes, tax split, registration validation.
  17 tests.

**Gaps:**
- The seeded HSN/SAC codes are **guesses mapped by tax rate**. Someone who knows the product mix must
  confirm them. They are not tax advice.
- **Reports do not filter by legal entity.** With a FOFO branch in scope, "revenue" still counts
  money belonging to the franchisee. This is the most dangerous open item in the project.

### Design system — **Built**

- `src/styles/tokens.css` — a palette layer no component may touch, and a semantic layer
  (`--surface-card`, `--danger-soft`, `--accent`) that is all components may use. Dark-mode
  overrides are written and inert; enabling them is a token switch, not a rewrite.
- `src/components/ui/index.tsx` — Button (4 variants, 3 sizes, with **loading** and disabled states),
  IconButton, Card, Badge, Metric, Field, Input, Banner, **Skeleton**, EmptyState, Overlay,
  ConfirmDialog, Tabs, Table.
- Motion: real keyframes. The project has no `tailwindcss-animate`, so the usual `animate-in`
  classes would have silently rendered nothing. 130–180ms; `prefers-reduced-motion` zeroes it all.
- Live style guide at `/workspace/style-guide`.

**Migrated so far: Masters only.** Every other module still uses literal hex.

### Branch scope picker — **Built**

One component, used on desktop and mobile — there were two divergent implementations.

- Tabs: All / COCO / FOCO / FOFO. **Tabs filter; they do not select.** An explicit "Select all N"
  button inside each tab does that, so a group with no branches can no longer silently empty the
  scope.
- Branches grouped under the business that operates them.
- Each scope has a colour, worn by the topbar: purple for a single branch, blue COCO, amber FOCO,
  green FOFO, grey for all.
- GST readiness per branch — *"no GSTIN, GST billing blocked"* — so it is learned here rather than
  when a receptionist is stopped mid-sale.

### Bookings — **Built**

- All three browser dialogs replaced: `window.prompt` for the cancellation reason (an auditable
  field captured in an OS dialog), `window.confirm` for drag-drop reschedule, `window.alert` for a
  blocked move.
- A live "now" line on the day timeline.

### POS — **Partial**

Rebuilt as three steps (Customer → Items → Pay), identical on desktop and mobile. Item grid with
search/barcode, favourites from top-sellers, out-of-stock disabled rather than silently ignored,
cart line editor, split tenders, cash denominations with change due, held sales.

**Gap:** the approved redesign — large tiles, quantity steppers on the card itself, plain-English
cart ("2 bottles · 200ml each", "Free with her package"), products showing brand and pack size — is
**not built**. It depended on the masters work exposing brand and unit, which is now done, so it is
unblocked.

### PWA / mobile — **Built**

Service worker rewritten (see defect 4). Missing 192px icon generated; a proper maskable icon with
the artwork inside the safe zone (the old one was being cropped on install). App shortcuts. Fixed a
`theme_color` mismatch that painted the Android status bar navy above a white header. Selectors open
as bottom sheets on mobile instead of clipped desktop dropdowns.

---

## Not built

| Area | Note |
| --- | --- |
| Entity-aware reports | **Highest priority.** FOFO revenue is counted as the company's. |
| Setup consolidation | Services & Prices and Offers should fold into Masters — `docs/masters-consolidation-plan.md`. |
| Refund dialog tender split | The engine returns the correct split; the confirmation screen still shows guessed prose. |
| Salon website builder | Schema exists; no editor, no subdomain rendering. |
| Messaging providers | Campaign models exist; no WhatsApp/SMS/email delivery. |
| Online payments | Offline records only, by design. |
| Statutory payroll | PF/ESI/TDS/filings out of scope. |
| Monitoring, CI/CD | No error monitoring, no automated backups, no deployment pipeline. |

---

## Dead code to remove

- `src/components/workspace/modules/billing.tsx` — replaced by `pos.tsx`, no longer imported.
- `Service.category` (string) — superseded by `categoryId`. Drop once every read is switched.
- `InventoryItem.category` / `.unit` (strings) — superseded by the master FKs. Same.

---

## Environment notes

- The database is **Supabase** (`ap-south-1`), not a local Postgres.
- `prisma.config.ts` points the CLI at `DIRECT_URL` (5432). Migrations cannot run through the
  pgBouncer pooler on 6543 — they need session-level advisory locks and DDL in a transaction. The
  runtime client uses the pooler via `src/lib/db.ts`.
- `.env` holds live credentials and sits in a OneDrive-synced folder. It is gitignored, but OneDrive
  is not a secrets store. Rotate the Supabase password before this goes anywhere real.

---

## Suggested next order

1. **Entity-aware reports.** Stop counting franchisee revenue as the company's.
2. **Confirm the HSN/SAC codes** with someone who knows the products, before more GST invoices are
   issued on guessed codes.
3. **POS counter-mode rebuild** — now unblocked.
4. Continue the design-system migration: POS → Bookings → Invoices → Settings.
5. Fold Services & Prices and Offers into Masters; drop the dead string columns.
6. Add a CI check that runs `prisma migrate reset` against a throwaway database, so a broken
   migration history can never reach production again.

## Quality gate

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Note that **typecheck and tests both pass on a broken client/server boundary** — importing a database
module into a client component only fails at bundle time. `npm run build` is the only check that
catches it. That mistake happened twice this session.
