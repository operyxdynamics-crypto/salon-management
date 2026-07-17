# Company, Legal Entity, and Branch Profile Plan

Date: 2026-07-14
Scope: company profile, branch profile, COCO/FOCO/FOFO ownership, and state-wise GST registrations with per-branch input credit.

## The two facts that drive the whole design

**1. GST registration is state-wise, not branch-wise.**

One legal entity gets one GSTIN per state. Two branches in Bengaluru share a GSTIN - they are "additional places of business" on one registration, and cannot have separate GSTINs. A branch in Bengaluru and one in Pune need two GSTINs, and that is mandatory, not optional.

So the model is not "a branch may have its own GSTIN". It is:

> **A GST registration exists per (legal entity, state). Each branch points at exactly one.**

Input tax credit follows the same rule: ITC on a local vendor purchase is claimed against the GSTIN that *received* the supply. So a purchase must be booked against the branch's registration, not the company's default.

**2. A franchisee is a different company.**

FOFO means the franchisee owns the branch and operates it. It has its own PAN and its own GSTIN, so **it issues its own invoices**. Its revenue is not the parent company's revenue. If we model franchise as a flag on `Branch`, every revenue report silently adds up money that does not belong to the company, and every invoice carries the wrong supplier.

That means a `LegalEntity` table is unavoidable.

## Schema

```prisma
enum LegalEntityType {
  COMPANY      // the salon group itself
  FRANCHISEE   // an independent business operating under the brand
}

/// A registered business. The tenant always has exactly one COMPANY entity; each franchisee
/// that bills under its own name is another entity.
model LegalEntity {
  id            String            @id @default(cuid())
  tenantId      String
  tenant        Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  type          LegalEntityType
  /// Trading name, e.g. "Lumiere Studio".
  name          String
  /// Name on the PAN, printed on invoices, e.g. "Lumiere Beauty Pvt Ltd".
  legalName     String
  panNumber     String?
  cin           String?
  email         String?
  phone         String?
  isPrimary     Boolean           @default(false)  // the tenant's own company
  isActive      Boolean           @default(true)

  registrations GstRegistration[]
  ownedBranches Branch[]          @relation("BranchOwner")
  operatedBranches Branch[]       @relation("BranchOperator")
  invoices      Invoice[]

  @@index([tenantId, type])
}

/// One GSTIN. Unique per (entity, state) because that is how GST law works.
model GstRegistration {
  id            String       @id @default(cuid())
  legalEntityId String
  legalEntity   LegalEntity  @relation(fields: [legalEntityId], references: [id], onDelete: Cascade)
  gstin         String
  /// "Karnataka"
  state         String
  /// "29" - the first two digits of the GSTIN. Determines CGST/SGST vs IGST.
  stateCode     String
  /// Principal place of business for this registration.
  address       String?
  isActive      Boolean      @default(true)

  branches      Branch[]
  invoices      Invoice[]
  purchases     PurchaseEntry[]

  @@unique([legalEntityId, state])
  @@unique([gstin])
}

enum BranchOwnershipModel {
  COCO   // company owns, company operates
  FOCO   // franchisee owns the asset, company operates and bills
  FOFO   // franchisee owns and operates, and bills under its own GSTIN
}

model Branch {
  // ...existing
  ownershipModel     BranchOwnershipModel @default(COCO)
  /// Who owns the asset. Matters for franchise fee and P&L, not for invoicing.
  ownerEntityId      String?
  /// Who runs the branch, and therefore who supplies the service and issues the invoice.
  operatorEntityId   String?
  /// The registration invoices are issued under. Must belong to the operator entity and match
  /// the branch's state - enforced in code, because Prisma cannot express it.
  gstRegistrationId  String?
}
```

The billing rule falls out of this cleanly:

| Model | Owner | Operator | Invoice issued by |
| --- | --- | --- | --- |
| COCO | Company | Company | Company |
| FOCO | Franchisee | Company | **Company** |
| FOFO | Franchisee | Franchisee | **Franchisee** |

**The operator is the supplier.** That is the only rule needed - `operatorEntityId` decides whose name and GSTIN goes on the invoice.

## Invoice changes

The invoice must snapshot its supplier, for the same reason it snapshots price and HSN: it is a legal record of a specific supply on a specific day, and re-pointing a branch at a different entity next year must not rewrite it.

```prisma
model Invoice {
  // ...existing
  legalEntityId      String?   // who supplied
  gstRegistrationId  String?   // under which registration
  supplierName       String?   // snapshot
  supplierGstin      String?   // snapshot
  supplierStateCode  String?   // snapshot - drives CGST/SGST vs IGST
  placeOfSupplyState String?   // where the service was performed
}
```

CGST/SGST vs IGST then becomes a comparison, not an assumption: intra-state when `supplierStateCode` equals the place-of-supply state code, which for a salon is always the branch's own state. The current code hardcodes the intra-state split; this makes it derived.

## Purchases and input credit

```prisma
model PurchaseEntry {
  // ...existing
  gstRegistrationId String?   // the GSTIN claiming the credit
  vendorGstin       String?   // snapshot from the vendor invoice
  cgst              Decimal?
  sgst              Decimal?
  igst              Decimal?
}
```

A purchase booked at the Pune branch claims credit against the Pune GSTIN. That is the whole point of the per-state registration, and it is why the registration has to hang off the branch rather than the company.

## Reports must separate by entity

Once FOFO exists, "revenue" is ambiguous. Every money report needs a legal-entity filter, and the company's own P&L must **exclude** FOFO branches' sales - that money belongs to the franchisee. Franchise fee or royalty is a separate, later concern.

This is the part most likely to be got wrong quietly, so it needs a test.

## Migration

1. **Additive.** Create `LegalEntity`, `GstRegistration`, the enum, the nullable columns.
2. **Backfill.** For each tenant: create one `LegalEntity` (type COMPANY, isPrimary, from `Tenant.legalName` / `gstin` / `panNumber`); create a `GstRegistration` per distinct branch state, seeded with the tenant GSTIN where the state matches, blank otherwise; point every branch at it as COCO, owner = operator = the company. Existing invoices get the company snapshot.
3. **Cut over.** Checkout reads the branch's operator + registration. `Tenant.gstin` is deprecated and later dropped.

Nothing breaks for a single-branch single-state salon: it ends up with one entity, one registration, and COCO everywhere.

## UI

- **Settings → Company**: legal name, PAN, CIN, contact. List of GST registrations (state, GSTIN, address) with add/edit.
- **Settings → Branches → [branch]**: address, contact, hours, plus **Ownership** (COCO/FOCO/FOFO), owner entity, operator entity, and GST registration - with a validation message when the chosen registration's state does not match the branch's state, because that is the mistake people will actually make.
- **Franchisees**: a list of `LegalEntity` of type FRANCHISEE, each with its own PAN and registrations.

## Build order

1. Schema + migration (additive)
2. Backfill script + verification
3. Company / registrations / franchisee API + UI
4. Branch profile API + UI (ownership, operator, registration)
5. Checkout resolves supplier from the branch's operator; invoice snapshots it
6. Invoice template prints the supplier entity and derives CGST/SGST vs IGST
7. Purchases book against a registration; ITC report by GSTIN
8. Revenue reports filter by legal entity, excluding FOFO from company P&L

## Open questions

- Does a FOCO branch pay the franchisee a share, and should the app track it? (Out of scope for now.)
- Do franchisees log in and see only their branches? That is an RBAC change - the tenant is still one workspace, but a franchisee user must not see the company's other branches.
