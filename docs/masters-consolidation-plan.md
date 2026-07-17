# Masters Consolidation Plan

Date: 2026-07-14
Decision: Masters becomes the single home for everything a salon sets up once. Daily screens keep only what happens every day.

## The organising principle

> **Set up once → Masters. Do every day → the daily screens.**

Every current screen mixes the two, which is why an owner hunts across four places to configure a salon and a receptionist trips over settings they should never see.

## The seam through each existing screen

| Screen today | Setup half → moves to Masters | Operations half → stays |
| --- | --- | --- |
| **Services & Prices** | Services, prices, duration, buffers, branch price overrides, categories, consumption recipes | *nothing* — the screen is entirely setup, so it disappears from nav |
| **Stock** | Product catalogue (name, SKU, category, brand, unit, tax class, cost, retail, reorder level), vendors | Purchases, transfers, stocktakes, stock movements, low-stock alerts — **stays as "Stock"** |
| **Offers** | Membership definitions, package definitions, reward rules, **coupons** | Selling a membership, issuing a gift card, adjusting a wallet — these are sales actions and belong in POS / customer profile |
| **Settings** | Tax classes, expense categories | Business profile, branches, audit log |

Two screens leave the navigation: **Services & Prices** and **Offers**. **Stock** stays but loses its catalogue tab.

Staff is a deliberate exception. It looks like setup, but attendance, shifts, and leave are daily, and splitting a stylist's record across two screens would be worse than leaving it alone. **Team stays as it is.**

## The Masters section

```
Masters
├── Catalogue
│   ├── Services              (record master - rich editor)
│   ├── Service categories    (lookup)
│   ├── Products              (record master - rich editor)
│   ├── Product categories    (lookup)
│   ├── Brands                (lookup)
│   └── Units of measure      (lookup)
├── Commercial
│   ├── Tax classes (HSN/SAC) (lookup)
│   ├── Coupons               (record master - NEW)
│   ├── Memberships           (record master)
│   ├── Packages              (record master)
│   └── Reward rules          (record master)
└── Suppliers
    ├── Vendors               (record master)
    └── Expense categories    (lookup)
```

**Two kinds of master, two kinds of editor.** This distinction is load-bearing:

- **Lookup masters** — name, code, colour, sort order, active. The generic `MasterTable` already built handles these.
- **Record masters** — real entities with pricing, rules, and relationships. A service is not a name and a colour; it is a pricing object with branch overrides and a consumption recipe. These keep purpose-built editors, rehomed under Masters rather than flattened into a table.

Forcing a record master into the generic table is the main way this redesign could fail.

## Coupons (new schema)

Nothing exists today. Required behaviour: percent or flat discount, date/usage/customer limits, restriction to specific services/products/categories, and a minimum bill value.

```prisma
model Coupon {
  id                String       @id @default(cuid())
  tenantId          String
  tenant            Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  code              String       // "MONSOON20" - what reception types at the POS
  name              String
  description       String?

  discountType      DiscountType // PERCENT | FLAT
  discountValue     Decimal      @db.Decimal(10, 2)
  /// Ceiling on a percent discount, e.g. "20% off, up to ₹500".
  maxDiscountAmount Decimal?     @db.Decimal(10, 2)
  /// Bill must reach this before the coupon applies.
  minBillAmount     Decimal?     @db.Decimal(10, 2)

  startsAt          DateTime?
  endsAt            DateTime?
  /// Total redemptions allowed across all customers. Null = unlimited.
  maxRedemptions    Int?
  /// Redemptions allowed per customer. Null = unlimited.
  maxPerCustomer    Int?
  /// Only first-time customers may use it.
  newCustomersOnly  Boolean      @default(false)

  /// Empty restriction lists mean "applies to the whole bill".
  serviceIds        String[]
  productIds        String[]
  serviceCategoryIds String[]
  productCategoryIds String[]

  branchIds         String[]     // empty = all branches
  isActive          Boolean      @default(true)
  redemptions       CouponRedemption[]
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId, isActive])
}

model CouponRedemption {
  id         String   @id @default(cuid())
  couponId   String
  coupon     Coupon   @relation(fields: [couponId], references: [id], onDelete: Cascade)
  invoiceId  String   @unique
  customerId String
  /// The rupee amount actually taken off. Needed for reporting and for refund reversal.
  amount     Decimal  @db.Decimal(10, 2)
  createdAt  DateTime @default(now())

  @@index([couponId])
  @@index([customerId])
}

enum DiscountType { PERCENT FLAT }
```

**Validation must be server-side, in the checkout transaction.** A coupon's usage count is a race: two receptionists can redeem the last use of a 100-use coupon at the same moment. The count check and the `CouponRedemption` insert have to happen inside the existing serializable checkout transaction, exactly like stock decrement already does.

**Refunds must reverse it.** `CouponRedemption` is why the refund engine can restore a coupon's usage when an invoice is refunded. Without the redemption row, a refunded coupon is silently burned.

## Build order

1. **Coupon schema + migration** (additive).
2. **Coupon validation in `src/lib/coupons.ts`** — pure functions, unit-tested: eligibility, discount computation, cap, minimum bill. Same pattern as `refund.ts`.
3. **Masters shell** — sub-nav with the three groups, hosting the existing `MasterTable` for lookups.
4. **Rehome record masters** — move the Services editor and the Products catalogue editor under Masters, unchanged in behaviour. Move membership/package/reward-rule editors.
5. **Coupon editor + POS coupon field**, with redemption inside the checkout transaction.
6. **Refund reverses coupon redemption.**
7. **Remove Services & Prices and Offers from nav**; strip the catalogue tab from Stock.
8. Update `PROJECT_STATUS.md`.

Steps 1–2 are safe and independent. Step 7 is the destructive one and should land only after 3–6 are verified, so there is never a moment where a salon cannot edit its services.

## Risk

The one thing that can go badly: moving the Services editor. It carries branch price overrides and consumption recipes, and the POS reads it constantly. That move should be a **relocation, not a rewrite** — same component, new parent — and it needs a browser pass on POS pricing afterwards.
