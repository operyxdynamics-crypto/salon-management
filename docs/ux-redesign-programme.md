# Operyx UX Redesign Programme

Date: 2026-07-14
Purpose: one plan covering every module, the users they serve, how their data interconnects, and
the order in which we rebuild them.

---

## 1. The users, in priority order

| # | User | What they are doing | What kills the product for them |
| --- | --- | --- | --- |
| 1 | **Reception / stylist** (non-technical) | Ringing up sales, checking people in, all day, at speed | Jargon, hidden state, too many taps, anything that needs explaining twice |
| 2 | **Single-branch owner** | Running one salon; is also the receptionist half the time | Being shown franchise, multi-GSTIN, and entity concepts they will never use |
| 3 | **Multi-branch owner** | Comparing branches, moving stock, watching cash | Having to switch branch context constantly to answer one question |
| 4 | **Franchisor** (sells franchises) | Separating what is theirs from what is the franchisee's | Reports that add a franchisee's money to their own |
| 5 | **Enterprise brand** | Many entities, many states, audit and compliance | Anything that cannot be delegated or audited |

### The rule this produces

> **Complexity must be earned, not configured.**

A single-branch salon must never see COCO/FOCO/FOFO, legal entities, or a list of GST
registrations. Not behind a "simple mode" toggle — a toggle is one more thing to understand — but
because the app can see they have one branch and one entity, and therefore says nothing about
franchises.

**Capability flags derived from data, not settings:**

```
hasMultipleBranches   = branches.length > 1
hasFranchises         = legalEntities.some(e => e.type === "FRANCHISEE")
hasMultipleStates     = distinct(branch.state).length > 1
sellsProducts         = inventory.length > 0
hasStaffCommission    = staff.some(s => s.commissionRate > 0)
```

Each flag unlocks UI. Nobody is asked to declare who they are; the app notices.

**Concretely:** a single-branch salon sees no branch picker in the topbar at all. The Company tab
shows one GSTIN field, not a registrations table. The branch profile has no ownership section.
The moment they add a second branch, the picker appears.

---

## 2. Module inventory

Every module, its primary user, and its current state.

| # | Module | Primary user | State | The core problem to fix |
| --- | --- | --- | --- | --- |
| 1 | **Home / Today** | Reception, owner | Partial | It is a wall of KPIs. It should answer "what needs me right now?" |
| 2 | **Bookings** (calendar + list) | Reception | Partial | Two disconnected views; no now-line until recently; drag-drop is scary |
| 3 | **POS / Billing** | Reception | Partial | Rebuilt as 3 steps; the approved counter-mode (big tiles, steppers, plain English) is not built |
| 4 | **Invoices** | Owner, accountant | Partial | Buried inside Reports; the refund dialog still shows guessed prose |
| 5 | **Customers (CRM)** | Reception, owner | Partial | A list, not a relationship. No merge, no photos, no comms history |
| 6 | **Day close / Register** | Reception, owner | Built | Never browser-tested with real cash reconciliation |
| 7 | **Masters** | Owner | **Done** | Reference model for the rest |
| 8 | **Services & Prices** | Owner | Partial | Should fold into Masters |
| 9 | **Stock** | Owner, manager | Partial | Catalogue should move to Masters; operations stay |
| 10 | **Team** | Owner | Partial | No skill mapping (`StaffService` exists, unused), no permission editor |
| 11 | **Offers** (memberships, packages, gift cards, rewards) | Owner | Partial | Should fold into Masters |
| 12 | **Coupons** | Owner | **Done** | — |
| 13 | **Reports** | Owner, accountant | Partial | Now entity-aware; still no dedicated report pages, no exports, no GST return view |
| 14 | **Marketing** | Owner | Not built | Schema only; no providers |
| 15 | **Reviews** | Owner | Partial | Inbox exists; no reply flow |
| 16 | **Settings → Company / Branch** | Owner, franchisor | Built | Must hide itself from single-branch users |
| 17 | **Super Admin** | Platform | Partial | Separate product; out of this programme |
| 18 | **Marketplace / public booking** | Customer | Partial | Out of this programme's first pass |

---

## 3. The interconnection map

This is the part that is currently weakest. Data is linked *one way* — you can pick a category for
a service, but a category cannot show you its services. Every relationship below must be
**navigable from both ends**, because that is how people actually think ("who did this?", "what
else is in this?", "where else is this used?").

### The spine

```
Customer ──< Appointment ──> Service ──> Category
   │              │             │
   │              │             └──> Consumption recipe ──> Product
   │              ├──> Staff ──> Commission
   │              │
   │              └──> Invoice ──< InvoiceLine ──> Service | Product
   │                      │             └──> TaxClass (HSN/SAC)
   │                      ├──> Payment (tender)
   │                      ├──> CouponRedemption ──> Coupon
   │                      └──> LegalEntity + GstRegistration
   │
   ├──> Wallet / Loyalty / Package / Gift card / Membership
   └──> Reviews
```

### Two-way navigation required

| From here | You must be able to reach | Today |
| --- | --- | --- |
| Service | its category, its recipe (products it consumes), staff who can do it, bookings, revenue | Category only |
| Category | **its services**, its revenue share | ✗ missing |
| Product | brand, vendor, category, tax class, stock by branch, sales, services that consume it | Partial |
| Brand | **its products**, sales by brand, its vendor | ✗ missing |
| Vendor | **its brands**, its products, purchase history | ✗ missing |
| Tax class | **services and products using it**, GST collected under it | ✗ missing |
| Customer | appointments, invoices, balances, benefits, reviews, preferred staff | Mostly there |
| Staff | services they can do (`StaffService` — **unused**), bookings, commissions, attendance | ✗ skills missing |
| Coupon | **redemptions, the invoices they were used on** | ✗ missing |
| Invoice | customer, appointment, staff, coupon, supplier entity, refunds | Mostly there |
| Branch | operator entity, GSTIN, staff, stock, register sessions | Partial |

**Design consequence:** every master and every record gets a **detail view with "Used by" tabs**.
A category is not a row in a table — it is a thing with services under it. That is what "interconnect
the data" means in practice.

**The rule:** if a foreign key exists, both ends must be walkable in the UI. No exceptions.

---

## 4. Cross-cutting UX laws

These apply to every module, and most current problems are violations of one of them.

1. **Never a native browser dialog.** No `prompt`, `confirm`, or `alert`. (Fixed in Bookings and
   POS; audit the rest.)
2. **No hidden state.** If a field affects the total, it is visible on the thing it affects — not
   in a drawer behind it.
3. **Plain language.** "Tender", "idempotency", "GST pricing mode" are software words. Reception
   says *money received*, *change to give back*.
4. **Destructive actions state the consequence**, not "are you sure?" — *"12 records use this. They
   keep it; it just cannot be picked for anything new."*
5. **Archive, never delete**, anywhere a record can be referenced by an invoice.
6. **Skeletons, not spinners.** The layout must not jump when data lands.
7. **Every list has: search, an empty state that invites, a loading state, and a row action.**
8. **One primary action per screen.** If everything is emphasised, nothing is.
9. **Money is always right-aligned and tabular.** Numbers that shift as they change are unreadable.
10. **Every screen works at 1280×800** (a 14" laptop) without horizontal scroll.

---

## 5. Sequenced plan

Each step ships independently. Nothing is half-migrated for long.

### Phase 1 — Foundations (mostly done)
- ✅ Design tokens, primitives, style guide
- ✅ Masters (the reference implementation)
- ⬜ **Capability flags** — derive `hasMultipleBranches` / `hasFranchises` etc. and hide what is
  not earned. *This is the single highest-leverage change for persona 2.*

### Phase 2 — The daily loop (persona 1)
- ⬜ **POS counter-mode** — big tiles, steppers on the card, plain-English cart, brand + pack size
- ⬜ **Bookings** — calendar-first, saved views, drawer-based actions
- ⬜ **Home / Today** — replace the KPI wall with "what needs me now"

### Phase 3 — The record layer (interconnection)
- ⬜ **Detail views with "Used by" tabs** for every master (category → services, brand → products,
  tax class → items, vendor → brands)
- ⬜ **Staff skills** (`StaffService`) — and use them to filter who can be booked for what
- ⬜ **Customer 360** — merge duplicates, photos, communication history

### Phase 4 — The money layer (personas 3–5)
- ⬜ **Invoice centre** as its own module, out of Reports
- ⬜ **Refund dialog** showing the real tender split
- ⬜ **GST return view** per GSTIN (what you actually file)
- ⬜ **Reports** — dedicated pages, exports, branch comparison

### Phase 5 — Consolidation
- ⬜ Fold Services & Prices and Offers into Masters
- ⬜ Drop the dead string columns
- ⬜ Remove `billing.tsx`

---

## 6. What I need from you at each step

For every module, before I build:
1. Who is the primary user of *this screen*, and what are they trying to do in the next 10 seconds?
2. What is the one action they take most often?
3. What must never be more than one tap away?

Answering those three is worth more than any amount of visual direction.
