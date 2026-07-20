# Selling Operyx as SaaS — the plan

Written after reading Zylu and Salonify's public pricing, and auditing what Operyx already has.

---

## 1. Where you actually stand

**More is built than you'd think.** The multi-tenant foundation is real:

| Already working | Where |
|---|---|
| `SubscriptionPlan` with per-plan limits | `maxBranches`, `maxStaff`, `maxServices`, `maxMonthlyAppointments`, `maxStorageMb`, `features` JSON |
| `TenantSubscription` linking a salon to a plan | with `startsAt` / `endsAt` / `assignedBy` |
| Super-admin console | `/admin` — tenants, branches, documents, reporting, audit |
| Admin creates a salon, assigns a plan, emails the owner an invitation | `POST /api/v1/admin/tenants` |
| Tenant lifecycle | `DRAFT → PENDING_REVIEW → ACTIVE → SUSPENDED → ARCHIVED` |
| Branch verification and document review | admin approves before a salon goes live |
| Three seeded plans | starter / growth / scale |

**The one thing that stops you selling today:**

> `SubscriptionPlan` has **no price, no currency, and no billing period.**

There is no amount anywhere in the schema. So a plan today is a *permission envelope*, not a
*product*. Everything else in this document follows from closing that gap.

**Second gap: the limits are mostly decorative.** Only `maxServices` and `maxMonthlyAppointments`
are enforced. `maxBranches`, `maxStaff` and `maxStorageMb` are stored and never checked — so a
salon on Starter can open twenty branches and hire fifty people. If limits are what separate your
tiers, unenforced limits mean nobody ever needs to upgrade.

---

## 2. What the market is charging

### Zylu (₹, monthly, +18% GST, +₹1,999 one-time setup)

| | Lite | Grow | Standard | Premium |
|---|---|---|---|---|
| Monthly | ₹799 | ₹1,599 | ₹2,499 | ₹5,999 |
| Annual (per month) | ₹625 | ₹1,249 | ₹1,999 | ₹4,999 |
| Staff | 4 | 10 | 15 | 50 |
| Appointments | 300/mo | Unlimited | Unlimited | Unlimited |
| Products | 25 SKUs | 50 SKUs | Unlimited | Unlimited |

Attendance and WhatsApp API are **paid add-ons**, bundled free at Standard and above.

### Salonify

- **Free** — up to 100 bills/month
- **Professional** — ₹12,000/year (≈₹1,000/mo)
- **Enterprise** — ₹18,000/year (≈₹1,500/mo)

### What this tells us

1. **The Indian market anchors at ₹800–2,500/month.** Premium tiers exist but are a small slice.
2. **Annual billing is the norm** — Salonify sells *only* yearly for paid tiers. Cash up front, and
   far less churn.
3. **Staff count is the standard lever**, not appointments. It grows with the customer and is
   impossible to argue with.
4. **A free or cheap entry is table stakes.** Both competitors have one.
5. **Setup fees are normal here** (Zylu charges ₹1,999). Salons expect to be onboarded, not
   self-serve — and a fee funds that.
6. **Attendance is sold as premium.** You just built geofenced attendance with payroll; Zylu
   charges ₹499–999/month extra for theirs. Do not give it away in the cheapest tier.

---

## 3. Where Operyx is genuinely stronger

Price against these, not against feature-count:

- **GST that actually holds up.** Supplier GSTIN, place of supply, HSN/SAC per line, correct
  CGST/SGST vs IGST, serial numbers unique per branch per year and inside the 16-character limit.
  Most salon software prints a total and calls it a tax invoice. This is your wedge with any salon
  that has ever been audited or has a real accountant.
- **Franchise and multi-entity (COCO / FOCO / FOFO).** A FOFO franchisee bills under their *own*
  GSTIN and their revenue never lands in the company's books. Neither competitor addresses this,
  and franchise groups are the highest-value, stickiest customers in this market.
- **Geofenced attendance + payroll**, built in rather than an add-on.
- **Complexity you have to earn** — a single-salon owner never sees franchise concepts at all.

---

## 4. Proposed plans — premium positioning

**Decision: price above Zylu and sell on compliance and franchise support, not on cost.**

The reasoning: competing at ₹699 means winning solo operators who churn, pay least, and demand
most. Operyx's two real advantages — GST that survives an audit, and genuine franchise/multi-entity
support — are worth nothing to a single-chair salon and worth a great deal to a group with an
accountant. Those customers have budget, churn far less, and grow. There is no cheap tier here on
purpose; a discount you offer is worth more than a low price you advertise.

All prices **exclude 18% GST**, which is how competitors quote. Annual ≈20% off.

| | **Salon** | **Group** | **Franchise** |
|---|---|---|---|
| Monthly | ₹1,999 | ₹4,999 | ₹11,999 |
| Annual (per month) | ₹1,599 | ₹3,999 | ₹9,599 |
| Annual total | ₹19,188 | ₹47,988 | ₹1,15,188 |
| Branches | 1 | 5 | Unlimited |
| Staff | 15 | 50 | Unlimited |
| Products | Unlimited | Unlimited | Unlimited |
| Bookings, customers, invoices | Unlimited | Unlimited | Unlimited |
| GST tax invoices, HSN/SAC, CGST/SGST/IGST | ✓ | ✓ | ✓ |
| Attendance, geofencing + payroll | ✓ | ✓ | ✓ |
| Multi-branch reporting | — | ✓ | ✓ |
| Franchise models (COCO/FOCO/FOFO) | — | — | ✓ |
| Multiple legal entities and GSTINs | — | — | ✓ |
| Support | Chat | Priority | Dedicated account manager |

**Why this shape works against Zylu:** their Premium is ₹5,999 and still cannot express a
franchisee billing under its own GSTIN. Our Franchise tier is not competing with their Premium — it
is competing with a spreadsheet and an accountant, which costs far more than ₹11,999 a month.

**Salon at ₹1,999** sits just under Zylu's Standard (₹2,499) while including attendance and payroll
that Zylu charges ₹499–999/month extra for. So the entry tier is *better value* while the brand
stays premium.

**Positioning line:** "The only salon software an accountant will sign off on."

**Free trial: 14 days on Salon, no card.** Not a permanent free tier — a free tier of a *billing*
product attracts salons who will never pay and fills the database with abandoned data. A trial with
a deadline converts; a free plan defers the decision forever.

**Never limit invoices or customers.** Salonify's "100 bills/month" free plan teaches a salon to
stop using the software at month end — the exact opposite of the habit you want. Limit *capacity*
(staff, branches), never *usage of the core loop*.

**Onboarding fee ₹1,999**, waived on annual. Market-normal, funds the setup call, and filters
tyre-kickers.

---

## 5. What has to be built

Ordered so each stage is independently useful.

### Stage 1 — Make a plan a product *(blocks everything)*
- Add to `SubscriptionPlan`: `monthlyPrice`, `annualPrice`, `currency`, `isPublic`, `sortOrder`,
  `trialDays`, `setupFee`.
- Add to `TenantSubscription`: `billingPeriod` (MONTHLY/ANNUAL), `trialEndsAt`, `currentPeriodEnd`,
  `status` (TRIALING/ACTIVE/PAST_DUE/CANCELLED).
- Seed the four plans above.

### Stage 2 — Enforce the limits you already store
- `assertBranchCapacity`, `assertStaffCapacity` — the two levers the tiers actually sell on.
- Enforce `features` for attendance/payroll and franchise tooling.
- Every limit error must name the plan and offer the upgrade, never just "limit reached".

### Stage 3 — Super-admin: run the business
Extend `/admin` (it already lists tenants):
- Onboard a salon: create tenant → choose plan → choose billing period → invite owner.
- Change a plan, extend a trial, apply a discount, suspend for non-payment, reactivate.
- One screen answering: who is trialing, who converted, who is overdue, MRR, churn.

### Stage 4 — Take money (Razorpay)
Razorpay, not Stripe — UPI, netbanking and RuPay are how Indian salons pay, and Stripe India is
restrictive.
- Razorpay Subscriptions for recurring; UPI Autopay / eNACH for auto-debit.
- Webhooks for `charged`, `halted`, `cancelled`.
- **Grace period, not a cliff.** On a failed payment: 7 days of full access with a banner, then
  read-only, then suspend. Cutting a salon off mid-shift over a bounced mandate loses the customer
  permanently and it will happen on a Saturday.

### Stage 5 — Bill your own customers, correctly
You are an Indian SaaS selling to Indian businesses, so **you owe 18% GST on your own revenue** and
must issue your own tax invoices — with your GSTIN, the salon's GSTIN (they will ask, to claim
input credit), SAC code **998314**, and place of supply.

You already built exactly this engine for salons. Point it at yourself: same `invoice-document.ts`,
same numbering. This is a genuine advantage — most early SaaS fumbles its own GST compliance.

### Stage 6 — Self-serve signup
Public pricing page → pick plan → create salon → 14-day trial → convert. Only worth building once
stages 1–5 work; until then, admin-led onboarding is *better* for the first 20 customers because it
puts you on a call with every early user.

---

## 6. Order of work

1. **Plan pricing fields + seed the four plans** — nothing else is possible first.
2. **Enforce branch and staff limits** — without this, tiers are decorative.
3. **Super-admin onboarding + subscription management** — lets you sell manually, today, with an
   invoice and a bank transfer. **You can take real money at the end of this step.**
4. **Razorpay + webhooks + grace period** — removes the manual collection work.
5. **Your own GST invoices** — required the moment you take money.
6. **Public pricing page + self-serve trial** — scale.

Stages 1–3 are days, not weeks, because the schema and admin console already exist. **Sell manually
first.** Twenty hand-onboarded salons teach you more about pricing than any amount of billing code,
and every one of those calls is product research you cannot buy.

---

## 7. Decisions still open

- Free trial vs freemium (recommended: 14-day trial, no card)
- Setup fee: charge ₹1,999, or waive it to remove friction
- Whether WhatsApp is bundled or metered — it has a genuine per-message cost, so metering protects
  your margin but adds billing complexity
- Whether the marketplace (`/book/[slug]` public booking) is a plan feature or free for all tenants
