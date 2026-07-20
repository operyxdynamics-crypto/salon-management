# Competitor dossier

Researched 20 July 2026 from each vendor's own site plus Techjockey's India listings, which is where
Indian salon owners actually shop and where prices vendors don't publish get published anyway.

Covers **Salonist** and **ReSpark** in full. Zylu and Salonify were benchmarked earlier in
[SAAS-PLAN.md §2](./SAAS-PLAN.md); their numbers are repeated here for comparison but not re-derived.

**A warning about all of it:** everything below is marketing copy. A feature bullet on a website is
a claim, not a working screen. Where something matters enough to build against, it is worth
confirming in a demo before treating it as fact.

---

## The short version

| | Salonist | ReSpark | Zylu | Salonify | **Operyx** |
|---|---|---|---|---|---|
| Company | Shrivra | Relfor Labs | — | — | Operyx |
| Based | India (Mohali) | Pune | India | India | India |
| Founded | 2016 | — | — | — | 2026 |
| Claimed customers | 15,000+ salons | 3,000+ | — | — | 0 |
| Entry price | ₹19,800/yr (₹1,650/mo) | On request | ₹799/mo | Free |  ₹1,999/mo |
| Top price | ₹49,500/yr (₹4,125/mo) | On request | ₹5,999/mo | ₹1,500/mo | ₹11,999/mo |
| Pricing public? | Yes | **No** | Yes | Yes | Yes |
| Billing | Annual | Unknown | Monthly + annual | Annual only | Monthly + annual |
| GST invoicing | **Not mentioned** | **Not mentioned** | Not mentioned | Not mentioned | **Core** |
| Multi-entity / multi-GSTIN | No | No | No | No | **Yes** |
| Geography | Global, 13 languages | India + some export | India | India | India |

**The one line that matters:** across four competitors and every feature page they publish, the
words *GST*, *HSN*, *SAC*, *CGST*, *IGST* and *e-invoice* appear **zero times**. They all say
"billing" and "invoicing". None of them says "tax invoice".

That is either the best news in this document or a warning that Indian salons don't care. §6 argues
it's the former, and says how to find out cheaply.

---

# 1. Salonist

**salonist.io** · by Shrivra · founded 2016 · founder Neeraj Gupta · 1–100 staff
Sister products: AppointEze (appointments), EzeGym (gyms), HRMWage (HR).

## 1.1 What they are

The volume player. "#1 Salon Software", "Trusted by 15,000+ salons worldwide", 13 languages, and a
feature list as long as your arm. They are not really an India company selling to India — they are a
global horizontal selling to anyone in beauty, from tattoo studios to pet groomers to medical spas.

Twelve industry landing pages: barbershops, hair, massage, spas, bridal, nails, medical spa,
aesthetic clinic, tattoo, booth renters, tanning, pet grooming. That's an SEO strategy, not a
product strategy, and it tells you where their effort goes.

## 1.2 Pricing

**Two published prices that don't agree with each other**, which is itself worth knowing.

**On salonist.io (USD, monthly):** from $59/mo, editions $79–$179. Extra staff $10/staff/month,
free above 14 staff.

**On Techjockey (INR, annual, excl. GST):**

| Plan | Price/yr | MRP | Per month | What it adds |
|---|---|---|---|---|
| **Essential** | ₹19,800 | ₹22,000 | ₹1,650 | Unlimited appointments, before/after images, coupons, e-wallet & membership, staff performance, sales reports, website booking, phone support |
| **Advance** | ₹36,000 | ₹40,000 | ₹3,000 | + Unlimited clients, unlimited staff logins, **POS**, staff reports, product billing, appointment reports, customer history |
| **Expert** | ₹49,500 | ₹55,000 | ₹4,125 | + Inventory reports, **multi-branch**, loyalty/rewards, PayPal & Stripe, Facebook & Instagram booking, SMS API, Google Calendar |

Techjockey also lists an older two-plan structure — Basic ₹14,400/yr and Business ₹35,000/yr, incl.
GST — so the range has moved. Third-party aggregators quote ₹1,056–₹1,887/month, which matches
nothing on this page. **Treat any single Salonist price you are quoted as negotiable**: a vendor
with four contradictory public prices is a vendor who discounts.

### Two things to notice about that table

**POS is not in the entry plan.** A salon paying ₹19,800/year cannot take a payment. Billing arrives
at ₹36,000/year — nearly double.

**Multi-branch is top tier only, at ₹49,500/year.** A two-branch salon must buy Expert. Compare
Operyx Group at ₹47,988/year for five branches with everything included.

## 1.3 Features

Genuinely broad. Appointments (online booking, slot blockers, off-hours, package, membership,
recurring), inventory (centralised, transfers, audits, low-stock alerts), marketing (email, SMS,
reviews, coupons, gift cards, loyalty), payroll (commissions, schedules, KPIs, role assignment),
POS (bulk checkout, Stripe terminals, payment reports).

Beyond that: custom mobile app, online store, drag-and-drop consent forms, SalonistPay,
memberships, gift cards, analytics, branch management.

**Integrations:** Clover, GetResponse, Interakt, Mailchimp, PayPal, QuickBooks, **Razorpay**,
Shopify, Twilio, **WATI**, WooCommerce, WordPress. Razorpay and WATI are the India-facing ones.

**Compliance badges:** PCI-DSS, AICPA SOC, HIPAA, GDPR, CCPA. Serious-looking, and all of them are
*data* compliance. None is *tax* compliance.

**Apps:** iOS and Android, but the App Store listing is "Salonist for **Customers**" — the client
booking app. Staff appear to work in the browser.

## 1.4 What is missing

- **No GST anything.** "Quick Billing", "Product Billing", "Payment Tracking" — no tax invoice, no
  HSN/SAC, no CGST/SGST/IGST split, no GSTR-ready export. On a product with 26 listed features and
  five compliance badges, this is a deliberate absence, not an oversight.
- **No multi-entity.** One business, many branches. A franchisee billing under its own GSTIN has
  nowhere to live.
- **No attendance.** Payroll and commissions, yes. Clocking in, no — and certainly not geofenced.
- **English only** in the India listing, despite 13 languages globally.

## 1.5 Reviews

Techjockey: 5.0 from 9 reviews. Capterra 4.4, G2 5.0, SoftwareSuggest 4.9.

Read the reviews and they are strikingly content-free — *"there is nothing I don't like about it"*,
*"absolutely fantastic"*, three of them from "Founder, Cosmetics, 2–100 employees" within six weeks
of each other in late 2023. The one substantive criticism in the whole set: *"the system could load
slightly slower during peak business hours."* Peak hours is when a salon bills. That is the only
sentence on the page worth acting on.

**Nine reviews for a product claiming 15,000 salons** is the real finding. Either the customer base
is much smaller than advertised, or those customers are not engaged enough to review.

---

# 2. ReSpark

**respark.in** · Relfor Labs Pvt Ltd · 14th Floor Sky One, Kalyani Nagar, Pune 411006
Phone +91 91750 99232 · WhatsApp +91 84840 08133

## 2.1 What they are

The closer competitor, and the more serious one. Pune-based, India-first, 3,000+ businesses claimed,
and built for the way Indian salons actually run: WhatsApp everywhere, memberships and prepaid
packages as a first-class concept, biometric attendance, digital catalogue.

Their named customers are real Indian brands — Four Fountains, Spiceology, Studio G, Glaze Nail
Studio (Delhi), ARTISTA (Pune), Zsupriya's (Mumbai), Mac 'N Kell (Kerala). The testimonials name
specific staff at ReSpark by name (*"excellent support from Ms. Jhanvi"*, *"WhatsApp group chat
support"*). That is a company doing high-touch India-style service, and it is a real moat.

## 2.2 Pricing

**None published anywhere.** Not on their site, and Techjockey lists them as "Price On Request".
Every path is Book a Demo, Request Demo, or WhatsApp.

**What that tells you:**

- They sell, they don't self-serve. Every customer goes through a human.
- Prices are per-deal, so a comparison is a conversation, not a table.
- They likely price above where they'd be comfortable publishing.
- **A prospect cannot compare them to you without talking to them.** That is an opportunity: your
  price is on your website and theirs is not, and salon owners notice.

**Action: get a real quote.** Have someone request a demo as a 3-branch salon and write the number
down. Until then every pricing claim you make about ReSpark is a guess.

## 2.3 Features

### POS and billing
Any device. 50+ payment gateways with **EDC integration — ICICI, PhonePe, GPay**. Online *and
offline* transactions. Split payments across modes. Advance/balance payment handling. One-click
invoicing via **WhatsApp, SMS, email**. Memberships, packages and discounts applied automatically at
checkout. Role-based access, auto backup, cloud sync.

Offline mode and EDC integration are both things Operyx does not have.

### Employee management — their strongest module, and your direct rival
- Onboarding with joining dates, roles, **salaries and incentive structures** in one place
- **Biometric attendance** via hardware devices — explicitly to kill buddy-punching
- Daily, weekly and rotating rosters across locations
- Tiered targets by seniority: junior / mid / senior
- **Shared service incentives** — when two staff work one service, the system splits the incentive
  by pre-set rules
- Per-staff calendars with automated 10-minute prep reminders
- Attendance logs and monthly reports; earnings by individual, service type or revenue

**Shared-service incentive splitting is the sharpest thing in this document.** It is a real salon
problem — a bridal package touched by four people — and Operyx does not solve it. It also cannot be
faked at demo time.

### The rest
- **AI Assistant chatbot for owners** — natural-language queries over live reports, multi-branch
- **Digital catalogue** — customer-facing services, products and promotions
- **E-commerce** — own storefront, unlimited items, secure payments
- **Memberships and packages** — discount, prepaid value, **shared family plans**, **hourly plans
  for spas**; balances and expiry tracked automatically, redeemed by phone number
- **WhatsApp marketing** — personalised offers, automated birthday wishes, campaign creator
- **CRM** with 360° client history; **feedback** after every visit, tracked per stylist
- **Inventory** linked to service consumption — usage per service, wastage, pilferage control
- **Enquiry management** — they have a sales CRM for their salons, as you now do for yourself

Verticals: salons, spas, aesthetic/skin clinics, nail studios, tattoo studios, wellness, pet
grooming.

## 2.4 What is missing

- **No GST anything**, again. Their POS page lists twelve checkout features in detail and does not
  once say tax invoice, HSN, SAC or GSTIN.
- **No multi-entity or franchise model.** "Multi-location" is branches of one business.
- **Windows and Android only** on Techjockey — no iOS listed, no MacOS. Operyx is a web app and runs
  anywhere.
- **Biometric attendance needs hardware.** A device per branch, bought, installed and maintained.
  Operyx's geofenced phone check-in needs nothing. Their approach is more tamper-proof; yours is
  free and works for field staff, which theirs cannot do at all.
- **Business size: "Startups, Medium Business, SMBs, SMEs, MSMBs"** — Techjockey does not list
  Enterprise. They are not chasing large chains.
- **Only 5 ratings (4.6)** on Techjockey and no written reviews.

---

# 3. Feature-by-feature

✓ built · ~ partial · ✗ absent · ? unverified

| | Salonist | ReSpark | **Operyx** |
|---|---|---|---|
| Online booking | ✓ | ✓ | ✓ |
| POS / billing | ✓ (paid tier) | ✓ | ✓ |
| Offline billing | ? | ✓ | ✗ |
| EDC / card machine integration | ~ (Stripe, Clover) | ✓ (ICICI, PhonePe, GPay) | ✗ |
| Split payments | ✓ | ✓ | ✓ |
| **GST tax invoice, HSN/SAC** | ✗ | ✗ | **✓** |
| **CGST/SGST vs IGST** | ✗ | ✗ | **✓** |
| **Multiple legal entities / GSTINs** | ✗ | ✗ | **✓** |
| **Franchise models (COCO/FOCO/FOFO)** | ✗ | ✗ | **✓** |
| A4 + A5 invoice printing | ? | ? | **✓** |
| Inventory | ✓ | ✓ | ✓ |
| Service-consumption recipes | ✗ | ✓ | ✓ |
| Memberships & packages | ✓ | ✓ | ✓ |
| Prepaid / wallet | ✓ | ✓ | ✓ |
| **Family / shared plans** | ✗ | ✓ | ✗ |
| **Hourly spa plans** | ✗ | ✓ | ✗ |
| Loyalty & rewards | ✓ (top tier) | ✓ | ✓ |
| Gift cards / vouchers | ✓ | ✓ | ✓ |
| Coupons | ✓ | ✓ | ✓ |
| WhatsApp messaging | ~ (via WATI) | ✓ native | ~ (template ready, not wired) |
| SMS / email campaigns | ✓ | ✓ | ~ |
| **Automated birthday wishes** | ✓ | ✓ | ✗ |
| Reviews / feedback capture | ✓ | ✓ | ✓ |
| Staff commissions | ✓ | ✓ | ✓ |
| **Shared-service incentive split** | ✗ | ✓ | ✗ |
| **Tiered targets by seniority** | ✗ | ✓ | ✗ |
| Attendance | ✗ | ✓ biometric | ✓ geofenced |
| **Field-work attendance approval** | ✗ | ✗ | **✓** |
| Payroll / payslips | ✓ | ✓ | ✓ |
| Rostering / shifts | ✓ | ✓ | ✓ |
| Multi-branch | ✓ (top tier) | ✓ | ✓ |
| **Owner AI assistant** | ~ "AI Integrated" | ✓ | ✗ |
| Customer mobile app | ✓ | ✓ | ✗ (web) |
| Staff mobile app | ✗ | ✓ | ~ (web) |
| Digital catalogue | ~ online store | ✓ | ~ marketplace |
| E-commerce storefront | ✓ | ✓ | ✗ |
| Salon website builder | ✗ | ✗ | ✓ |
| Consent forms | ✓ | ✗ | ✗ |
| Enquiry/lead CRM for the salon | ✓ | ✓ | ✗ |
| Public pricing | ✓ | ✗ | ✓ |
| Free trial | ✓ 14 days | ✗ demo only | ✓ 14 days |

## Read that honestly

**Operyx wins on exactly one axis: Indian tax and legal structure.** GST, HSN/SAC, the
intra/inter-state split, multiple GSTINs, franchise models, A4/A5 tax invoices. Nothing else in the
table is a lead you hold.

**You are behind on five things**, and they are not exotic:

1. **Shared-service incentive splitting** (ReSpark) — a real bridal/spa problem, a real objection
2. **Native WhatsApp** (ReSpark) — the OTP template is written but nothing is wired
3. **Offline billing and EDC integration** (ReSpark) — Indian salons lose internet
4. **Customer mobile app** (both) — every competitor has one
5. **Family/shared and hourly plans** (ReSpark) — spa-specific, and spas are half this market

**And on one thing you cannot buy:** ReSpark has 3,000 customers, named brands, and testimonials
that thank support staff by name. You have zero. No feature closes that gap; only the first fifty
customers do.

---

# 4. Pricing map

Annualised, per month, excl. GST.

```
₹0        ₹1,000     ₹2,000     ₹3,000     ₹4,000     ₹5,000        ₹9,599
|---------|----------|----------|----------|----------|-------------|
Salonify  Zylu Lite  Zylu Std   Salonist   Salonist              Operyx
free      ₹625       ₹1,999     Advance    Expert                Franchise
          Salonify   Salonist   ₹3,000     ₹4,125                (annual)
          Pro ₹1,000 Essential             Operyx Group
          Operyx     ₹1,650                ₹3,999
          Salon ₹1,599                     Zylu Premium ₹4,999
                                           ReSpark: ¯\_(ツ)_/¯
```

**Operyx Salon at ₹1,599/mo annual** lands with Salonist Essential (₹1,650) and Salonify
Professional — and includes POS, which Salonist Essential does not.

**Operyx Group at ₹3,999/mo annual** undercuts Salonist Expert (₹4,125) and Zylu Premium (₹4,999),
both of which top out where you begin.

**Operyx Franchise at ₹9,599/mo annual has no competitor at all.** Nothing in this document reaches
₹5,999. That is not a gap in the market you have spotted — it is a price nobody has proved a salon
will pay. Franchise is a sold product, not a listed one, and the first one will be sold on a call.

---

# 5. Battle cards

## Against Salonist

**Lead with:** *"Their entry plan can't take a payment."* POS starts at ₹36,000/year. Operyx Salon
bills from day one at ₹19,188.

**Then:** *"Multi-branch costs ₹49,500 a year with them. Five branches is ₹47,988 with us."*

**Then GST:** ask what their invoice looks like at audit. Show yours — HSN column, CGST/SGST split,
A4 and A5.

**When they say 15,000 customers:** don't argue. *"They sell in thirteen languages to twelve
industries including pet grooming. We build for Indian salons and Indian tax. Which do you want?"*

**Their comeback:** brand, longevity since 2016, PCI-DSS/SOC/HIPAA badges, a customer mobile app,
and a much longer feature list. Do not get into a feature count you will lose.

## Against ReSpark

**Hardest of the four.** India-first, real brands, genuine depth, high-touch support.

**Lead with price transparency:** *"Our pricing is on our website. Ask them for theirs."*

**Then GST and franchise:** their POS page lists twelve checkout features and never says tax
invoice. If the prospect has more than one GSTIN or any franchisee, they cannot be served by
ReSpark at all. That is not a weakness you argue — it is a structural fact.

**Then attendance:** *"Theirs needs a biometric device in every branch. Ours is the phone in their
pocket, geofenced, and it handles staff working off-site — which a fingerprint reader cannot."*

**When they raise shared-service incentives:** don't bluff. It's a real gap. Say it's on the
roadmap and move to what you do have. A caught bluff costs the deal; an admitted gap rarely does.

**Their comeback:** 3,000 customers, WhatsApp built in, offline billing, EDC integration, family and
hourly plans, an AI assistant, and support people the customer will name in a testimonial. On a
feature-for-feature demo against ReSpark you will lose on volume. Compete on compliance and
structure, or don't compete.

---

# 6. What to do about it

## Confirm the wedge before betting the company on it

Everything above says no competitor does GST. Two readings:

1. It's an unserved need and you own it.
2. **Indian salons don't ask for it**, so nobody built it.

Four vendors independently skipping the same feature is evidence for (2), not (1). Salons bill
walk-in customers who don't claim input credit; the pressure is on the salon's own filing, which
their CA handles from a sales report.

**Test it before the roadmap depends on it.** Ask the first twenty leads one question: *"When your
CA does your GST return, where do the numbers come from?"* If the answer is "I export and he sorts
it out", the wedge is thinner than this document assumes and the pitch has to move toward franchise
structure instead. Twenty calls, no code.

## Fix the pricing contradiction we just created

SAAS-PLAN.md §4 says, in bold: **"Never limit invoices or customers. Limit *capacity* (staff,
branches), never *usage of the core loop*."** The plan table says bookings are unlimited on every
tier.

Today's add-on work put a **1,000 bookings/month ceiling on Salon and 5,000 on Group**, so the
"Extra appointments" pack has something to lift. That directly contradicts the stated principle, and
1,000/month is roughly 33 a day — a busy single salon will hit it and be blocked mid-shift.

Three ways out, and one has to be picked:

1. **Raise the ceilings** to 3,000 / 15,000 so only genuinely large salons ever see them.
2. **Drop appointment limits entirely**, keep branches and staff as the only levers, and sell the
   appointment pack to nobody. Consistent with the doc; loses one add-on.
3. **Keep them and change the principle** in SAAS-PLAN.md, on the argument that Zylu caps Lite at
   300/month and the market accepts it.

**Decided 20 July 2026: option (1).** Ceilings raised to 3,000 (Salon) and 15,000 (Group) in the
seed. The add-on and expansion revenue survive; no real customer is blocked by a limit they'd have
to be enormous to reach.

## Build order, on this evidence

1. **WhatsApp, properly wired.** Both India competitors have it natively. The template is written;
   nothing sends. This is table stakes, not differentiation.
2. **Shared-service incentive splitting.** ReSpark's sharpest weapon and a genuine salon problem.
3. **Offline billing.** ReSpark advertises it because Indian salons lose internet. You will hear this.
4. **Family/shared and hourly plans** if you sell to spas.
5. **Customer app** — last. It's the most visible and the least urgent; a mobile web booking flow
   covers most of it, and nobody switches software for an app.

## Don't do

- **Don't add a free tier.** Salonify's free plan caps at 100 bills a month, which teaches a salon
  to stop using the software at month end. Trial with a deadline, always.
- **Don't chase Salonist's feature count.** Twelve industries and thirteen languages is what a
  horizontal does. Depth in one market beats breadth across twelve.
- **Don't compete on price with Zylu.** ₹799 buys salons who churn, pay least and demand most.

---

## Sources

- [Salonist](https://salonist.io/) · [pricing](https://salonist.io/industries/pricing) · [Techjockey listing](https://www.techjockey.com/detail/salonist)
- [ReSpark](https://respark.in/) · [POS](https://respark.in/salon-pos-software/) · [employee management](https://respark.in/salon-employee-management/) · [Techjockey listing](https://www.techjockey.com/detail/respark-salon-software)
- Zylu and Salonify: see [SAAS-PLAN.md §2](./SAAS-PLAN.md)
