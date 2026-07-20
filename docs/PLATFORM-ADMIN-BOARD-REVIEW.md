# Platform admin — the board review

Five people in a room deciding what the Operyx control room must do. Each argues their corner, each
has a blind spot, and where they conflict a decision is recorded rather than fudged.

Context that governs everything below: **Operyx is a small team selling its first customers next
month.** Most good ideas in this document are correct and premature. The panel's real job is to say
no to nine of them.

---

## 1. What each seat wants

### CEO — "Will we still be here in twelve months?"

Wants one screen that answers whether the company is growing, and the honesty to show when it
isn't.

- **MRR and net revenue retention.** NRR above 100% means existing customers grow faster than they
  leave; the company can survive a bad sales month. Below 100% means the bucket leaks and every new
  customer is replacing one lost.
- **Churn, with reasons.** Not a number — a list of names and why.
- **Cash position against the wage bill.** Runway is a founder's real dashboard.

*Blind spot:* wants more dashboards than anyone will open. A metric nobody acts on is decoration
that costs engineering time.

### COO — "Can three people serve a hundred salons?"

Cares about the cost of each customer *after* the sale.

- **Time-to-first-bill.** The single best predictor of whether a salon stays. A salon that bills on
  day one almost never churns; one that hasn't by day ten usually does.
- **Onboarding checklist per salon**, so anyone can pick up someone else's half-finished setup.
- **Support load** — how many salons needed help this week, and what for. Three tickets about the
  same confusing screen is a product fix, not a staffing problem.
- **A support view**: when a salon rings, see their setup and their last invoice without asking
  them to read numbers down the phone.

*Blind spot:* wants process before there is volume to justify it. Ticket categorisation at eight
customers is bureaucracy.

### CTO — "Will this fall over, and can I sleep?"

- **Errors and uptime.** Which salons hit failures, and how often.
- **Cost per tenant.** Database rows, storage, PDF renders. At ₹1,999/month a salon that costs
  ₹900 to serve is not a good customer, and nobody finds out until the bill arrives.
- **Backups verified**, not merely configured. A backup nobody has restored is a rumour.
- **A safe way to change things** for one salon without deploying — feature flags per tenant.

*Blind spot:* wants to *build* monitoring. Buy it. Sentry and the hosting dashboard exist and are
better than anything worth writing here.

### CMO — "Where do customers come from and what do they cost?"

- **Lead source on every enquiry**, carried through to whether they converted. Without it, spend is
  guesswork wearing a suit.
- **Conversion by stage** — enquiry → demo → trial → paid. The stage that leaks tells you what to
  fix.
- **CAC against LTV.** If a customer costs ₹8,000 to win and pays ₹1,999/month, the business works
  only if they stay past month five. That single ratio decides whether marketing scales or bankrupts
  you.
- **Referrals.** A salon owner's recommendation to another salon owner is the cheapest and highest
  intent lead this business will ever get.

*Blind spot:* wants attribution modelling at a volume where twelve leads cannot be statistically
anything. Count them by hand until the hand-counting hurts.

### CBO — "How does revenue grow without new logos?"

- **Expansion revenue.** A salon that opens a second branch should hit a limit and be *offered* the
  upgrade, not blocked with an error. Expansion is the cheapest revenue in SaaS.
- **Upgrade triggers.** Which salons are near their staff or branch ceiling right now.
- **Annual conversion.** Moving a monthly customer to annual is cash today and a year of retention.
- **Resellers and partners** — beauty distributors and franchise consultants already sit in front of
  thousands of salons.

*Blind spot:* partner programmes before product-market fit. A reseller selling a product that churns
just distributes the churn faster.

---

## 2. Where they disagree, and the ruling

### CMO wants attribution dashboards. CTO says don't build them.

**Ruling: CTO wins, with a condition.** Do not build analytics. Do record **source on every enquiry
and whether it converted** — that is one field we already have, and it answers the only question
that matters at this size ("where did our customers come from?"). Revisit dashboards at ~100 leads
a month, when the numbers can carry a conclusion.

### COO wants view-as. CTO and the CEO's lawyer both flinch.

**Ruling: build it, heavily constrained.** Read-only, every use logged, and the salon can see it
happened. A salon's customer list holds phone numbers and visit histories of real people who never
agreed to Operyx staff browsing them. Being able to help is not the same as being entitled to look.
An unlogged impersonation feature is a data-protection incident waiting for a date.

### CBO wants a reseller portal. CEO says not yet.

**Ruling: CEO wins.** No partner tooling until retention is proven. But **record how each customer
was introduced** so that when the first distributor deal happens, the data to structure it already
exists.

### CEO wants NRR. CTO points out we cannot compute it yet.

**Ruling: both are right, and it is a gap.** NRR needs upgrade and downgrade history, and today a
plan change overwrites the old plan silently. **We must log every subscription change as an event**,
not just the current state. Without that history, churn analysis and NRR are permanently impossible
— and it is far cheaper to start recording now than to reconstruct later.

### Everyone wants alerts. Nobody wants to be woken.

**Ruling: no notification system.** Today's queue is the alert. One place, checked each morning. A
company of five does not need email alerts about its own dashboard; it needs the discipline to open
it.

---

## 3. What ships

Ordered by what it costs to not have.

| # | What | Whose | Why now |
|---|---|---|---|
| 1 | **Subscription event log** — every plan change, upgrade, downgrade, cancel, recorded as history | CEO | Without it NRR and cohort analysis are impossible forever. Cheapest thing here, highest permanent cost if skipped. |
| 2 | **Client detail page** — subscription, branches, documents, notes, support view | COO | The "Open" button currently 404s. The panel is unusable for support without it. |
| 3 | **Time-to-first-bill** on every salon | COO | Best available predictor of churn, and it makes onboarding measurable. |
| 4 | **Upgrade triggers** — who is at 80% of their staff or branch limit | CBO | Expansion revenue, and it turns a hard limit into a sales conversation. |
| 5 | **Lead source → conversion** | CMO | One field. Answers where customers come from, forever. |
| 6 | **Our own GST invoices** | CEO / legal | Non-optional the moment money is taken. |
| 7 | **View-as, read-only and logged** | COO | Support cannot function on descriptions read down a phone. |

---

## 4. Refused, with the condition for revisiting

| Refused | Revisit when |
|---|---|
| Admin roles and permissions | Someone is hired who should not see revenue |
| Automated dunning emails | Over ~50 customers. Until then a phone call recovers more money *and* tells you why they didn't pay |
| Reseller / partner portal | Retention proven over two quarters |
| In-app chat | Never — salons already live on WhatsApp |
| Custom monitoring | Never — buy Sentry |
| Attribution modelling | ~100 leads/month |
| Cohort retention charts | Two quarters of subscription history exists |
| Usage-based billing | A customer asks for it |

---

## 5. The one number each seat watches

If the panel could only keep five numbers:

| Seat | Number | Healthy |
|---|---|---|
| CEO | Net revenue retention | > 100% |
| COO | Time to first bill | < 3 days |
| CTO | Failed requests per salon per week | ~0 |
| CMO | CAC payback | < 5 months |
| CBO | Share of MRR from expansion | > 20% |

Three of those five cannot be computed today. That is the honest state of the panel, and item 1 on
the ship list is what unblocks two of them.

---

## 6. The thing the panel agreed on last

Every seat asked for a different screen. The one point of unanimous agreement was this:

> **The control room's job is not to describe the business. It is to make someone do something.**

A number nobody acts on should be deleted. Today's queue is the model — everything else earns its
place by changing what somebody does that morning.
