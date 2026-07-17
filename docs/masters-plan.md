# Master Data Plan

Date: 2026-07-14
Scope: rebuild the reference-data layer as real, tenant-scoped masters with one consistent UI.

## Why

Reference data in Operyx is currently in three states:

1. **Real masters** — `ServiceCategory`, `Vendor`. Tenant-scoped, sortable, archivable, seeded from platform templates. This is the right shape.
2. **Strings pretending to be masters** — `InventoryItem.category`, `InventoryItem.unit`, `Expense.category`. Free text, so "Shampoo" and "shampoo" are two categories, a typo in `unit` silently corrupts stock math, and reports group on whatever was typed.
3. **Missing** — `Brand`, and any HSN/SAC code.

Plus one live defect: `Service` carries **both** `category String` and `categoryId → ServiceCategory`. Two sources of truth. The POS filters on the string, so renaming a category in the master does not change what the POS shows.

## Compliance note (drives priority)

Indian GST invoices require an **HSN** code for goods and a **SAC** code for services. The schema has no field for either, and the invoice template prints no HSN column. **GST invoices issued today are not compliant.** Retrofitting this after a pilot salon has thousands of live invoices is far more painful than adding it now, because historical lines need a code too.

## The master registry

| Master | State | Notes |
| --- | --- | --- |
| Service category | Exists | Keep. Remove the duplicate `Service.category` string. |
| Product category | **New** | Replaces `InventoryItem.category` string. |
| Brand | **New** | Salon retail is brand-led. Enables sales-by-brand, POS brand filter, brand-wise stock valuation. |
| Unit of measure | **New** | Replaces `InventoryItem.unit` string. Feeds stock math and service recipes. |
| Tax class (HSN/SAC) | **New** | Code + rate + goods/service. Replaces the free-typed `taxRate`. |
| Expense category | **New** | Replaces `Expense.category` string. |
| Vendor | Exists | Add `brands` relation. |
| Membership / Package / Gift card / Reward rule | Exists | Benefit masters. Out of scope here. |

## Common master shape

Every master follows one contract, so the UI and API can be generic:

```prisma
id         String   @id @default(cuid())
tenantId   String                          // every master is tenant-scoped
name       String
code       String?                         // short code for receipts/exports
description String?
color      String?                         // POS chip colour
sortOrder  Int      @default(0)            // manual ordering, not alphabetical
isActive   Boolean  @default(true)         // archive, never delete
createdAt  DateTime @default(now())
updatedAt  DateTime @updatedAt

@@unique([tenantId, name])
@@index([tenantId, sortOrder])
```

**Archive, never delete.** Historical invoices, stock movements, and expenses point at these rows. A hard delete either breaks referential integrity or silently rewrites history. Archiving hides a master from new use while leaving old records readable. The UI must say "Archive", not "Delete", and must show a usage count ("used by 12 products") before archiving.

## Schema changes

```prisma
model ProductCategory {
  // common shape
  products InventoryItem[]
}

model Brand {
  // common shape
  logoUrl  String?
  vendorId String?          // the distributor who supplies it
  vendor   Vendor?  @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  products InventoryItem[]
}

model UnitOfMeasure {
  // common shape  (name "Millilitre", code "ml")
  allowsFraction Boolean @default(true)   // pieces cannot be sold as 0.5
  products       InventoryItem[]
}

model TaxClass {
  // common shape  (name "Hair care products")
  code     String            // HSN "3305" or SAC "999721"
  kind     TaxClassKind      // GOODS | SERVICE
  rate     Decimal @db.Decimal(5, 2)   // 0 / 5 / 12 / 18 / 28
  services Service[]
  products InventoryItem[]
}

enum TaxClassKind { GOODS SERVICE }

model ExpenseCategory {
  // common shape
  expenses Expense[]
}
```

And on the consumers:

```prisma
model InventoryItem {
  categoryId String?   // was: category String
  brandId    String?   // new
  unitId     String?   // was: unit String
  taxClassId String?   // new; taxRate stays as the resolved snapshot
}

model Service {
  // categoryId already exists - DROP the duplicate `category String`
  taxClassId String?
}

model Expense {
  categoryId String?   // was: category String
}
```

`taxRate` stays on the item as a **resolved snapshot**, because an invoice line must keep the rate that applied on the day it was billed. The master supplies the default; the line freezes it. Same reason `InvoiceLine` already snapshots `unitPrice` and `taxRate`.

## Migration is the risky part

Three steps, three separate migrations. Do not collapse them.

1. **Additive.** Create the new tables and the nullable FK columns. Nothing reads them yet. Safe to deploy.
2. **Backfill.** A script walks existing rows, creates a master per distinct string value (case-insensitively deduped, so "Shampoo"/"shampoo" collapse to one), and points the FK at it. Items with no match get an "Uncategorised" master rather than null. HSN/SAC cannot be inferred — seed a standard salon tax-class set and map by current `taxRate`, then flag every product for owner review.
3. **Cut over and drop.** Switch all reads (POS filters, reports, stock) to the FK, verify, then drop the old string columns in a later migration.

Between 2 and 3 both columns exist and must agree. Keep that window short.

## Platform templates

`ServiceCategoryTemplate` already lets Super Admin seed new tenants. Extend the same idea so a new salon does not start with empty masters:

- Product categories: Hair care, Skin care, Nails, Tools, Consumables, Retail
- Units: ml, litre, gram, kg, piece, pack
- Tax classes: a standard salon HSN/SAC set (e.g. SAC 999721 beauty treatment @ 18%, HSN 3305 hair preparations @ 18%, HSN 3304 cosmetics @ 18%)
- Expense categories: Rent, Salaries, Utilities, Supplies, Marketing, Maintenance

An owner should be able to run a salon on day one without inventing a tax code.

## UI: one Masters screen

Today masters are scattered — service categories live inside Services, vendors inside Stock, nothing for the rest. Replace with a single **Setup → Masters** screen:

- Left rail: the master types (Service categories, Product categories, Brands, Units, Tax classes, Expense categories, Vendors)
- Right pane: one generic table — search, add, inline edit, drag to reorder, archive toggle, and a **usage count** per row
- One `MasterTable` component driven by a config per master type. Adding a master later is a config entry, not a new screen.

Archiving a master that is still in use warns first and states what will happen: existing records keep it, new records cannot pick it.

## Build order

1. Schema migration 1 (additive) + seed templates
2. Backfill script + owner review screen for tax classes
3. Masters API (`/api/v1/operations/masters/[type]`) — one route, generic
4. Masters UI (`MasterTable` + config)
5. Switch POS / stock / reports reads to the FKs — **this is where `Service.category` dies**
6. Add HSN/SAC column to the GST invoice template
7. Migration 3: drop the dead string columns
8. Backfill verification: every product has a category, unit, tax class; no orphans

Steps 1–2 are safe to ship alone. Step 5 is the one that can break the POS, so it wants a test pass.

## Open questions

- Should branches be able to override a product's price/tax like `BranchService` does for services? Today product pricing is tenant-wide.
- Do brands need a **margin target** so the reports can flag underperforming retail lines?
- Are unit conversions needed (buy in litres, consume in ml)? The recipe model currently assumes one unit throughout.
