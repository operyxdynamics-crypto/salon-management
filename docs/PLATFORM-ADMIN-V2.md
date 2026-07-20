# Platform admin, rebuilt around how Operyx actually sells

## What was wrong

Two structural mistakes, not styling ones.

**1. Two systems with a wall between them.** Enquiries were one thing, Clients another. But a salon
does not stop being a prospect and start being a client at some clean moment — it *moves along a
journey*. Because a trialling salon had a tenant record, it appeared under Clients, which is why a
trial showed up in a list of customers and looked wrong. It was wrong.

**2. Fixed plans, hard limits.** A salon with 5 branches on Group is fine on branches and out of
appointments. The only answer the old model had was "upgrade to Franchise", which is absurd — they
do not need unlimited branches, they need more bookings. Real SaaS sells a base plan plus add-ons.

---

## The new shape

Three separate screens, because they are three different jobs done by possibly three different
people on different days.

```
PIPELINE          TRIALS              CUSTOMERS
(not yet paying)  (using it, free)    (paying)

New lead      →   Trial started   →   Active
Contacted         Trial ending        Renewing
Demo booked       Expired             Past due
Quoted                                Cancelled
Lost
```

A salon appears in **exactly one** of these at a time. A trial is never in Customers. That is the
fix for the thing you saw.

### Navigation

| Screen | Who is here | The question it answers |
|---|---|---|
| **Today** | anything needing action | What will hurt if I ignore it? |
| **Pipeline** | leads, demos, quotes | Who am I about to win? |
| **Trials** | salons trialling now | Who is about to convert or slip away? |
| **Customers** | paying salons only | Which of my customers is in trouble? |
| **Money** | — | Am I growing or shrinking? |
| **Packages** | plans + add-ons | What do we sell? |
| **Activity** | — | Who did what? |

---

## The sales journey, as the panel supports it

**1. Lead arrives** — from Meta, a referral, a walk-in. Record salon, contact, phone, **source**,
and their size (branches, staff, rough monthly appointments). Size is what decides the quote.

**2. Call them.** Status → Contacted. Log what they said. Set the next follow-up date.

**3. Demo.** Status → Demo booked, with a date. Today reminds you.

**4. Quote.** This is the new piece. Pick a base plan, add whatever packs they need, and the panel
computes the total with GST. The quote is saved against the lead, so when they ask "what did you
say it was?" three weeks later, the answer is recorded rather than remembered.

**5. Trial.** Converting a lead to a trial creates the salon and the owner invitation in one step.
It moves from Pipeline to **Trials**. It is not a customer yet and never appears as one.

**6. Close.** Mark paid → it becomes a **Customer**. This is the only transition that creates
revenue, and it is the moment MRR moves.

**7. Lost** — with a reason. A lost lead leaves the pipeline but stays in the record, because the
reasons are what tell you whether you are losing on price, features, or follow-up.

---

## Packages: base + add-ons

A plan sets the base. Add-ons extend it without changing tier.

### Base plans

| | Salon | Group | Franchise |
|---|---|---|---|
| Monthly | ₹1,999 | ₹4,999 | ₹11,999 |
| Branches | 1 | 5 | Unlimited |
| Staff | 15 | 50 | Unlimited |
| Appointments/month | 1,000 | 5,000 | Unlimited |

### Add-on packs

| Add-on | Pack | Price/month |
|---|---|---|
| Extra appointments | +500 | ₹500 |
| Extra branch | +1 | ₹800 |
| Extra staff seats | +5 | ₹400 |
| WhatsApp credits | +1,000 messages | ₹600 |

**Effective limit = plan base + all add-on quantities.** So Group with 2 appointment packs is 5
branches and 6,000 appointments, at ₹5,999/month.

**Two deliberate rules:**

- **Quantity, not price, is what's stored per add-on.** The price comes from the add-on record, so
  changing a pack price later never silently re-prices an existing customer — the same rule as base
  plans.
- **WhatsApp credits are metered, not a limit.** Every message costs Operyx real money to send, so
  unused credits do not roll over indefinitely and the balance must be visible before a salon is
  surprised by it.

### When a salon hits a limit

The old behaviour was an error: *"Group includes 5 branches and you're using 5."* Dead end.

The new behaviour is an offer: **"You're at your appointment limit. Add 500 more for ₹500/month?"**
— and Today shows Operyx who is near a ceiling, so it becomes a sales call rather than a support
complaint. That is the difference between a limit that annoys customers and one that grows revenue.

---

## What has to be built

| # | What | Status |
|---|---|---|
| 1 | `AddOn` and `SubscriptionAddOn` models; effective-limit calculation | **Done** — `src/lib/packages.ts`, 20 tests |
| 2 | Pipeline stages on the lead, including QUOTED and a saved quote | **Done** — stage columns, quote frozen onto the lead |
| 3 | **Trials** screen, and Customers filtered to paying only | **Done** — this was the reported bug |
| 4 | Quote builder — base plan + add-ons, live total with GST | **Done** — priced server-side, never from the browser |
| 5 | Convert lead → trial → customer in one flow | **Done** — Start trial tab on the lead |
| 6 | Near-limit detection on Today | **Done** — `AT_LIMIT` and `NEAR_LIMIT` work items |
| 7 | Add-on management under Packages | **Done** — plans and packs on one page |

### What changed on disk

| File | What it does |
|---|---|
| `src/lib/packages.ts` | Effective limits, quote arithmetic, 80% warnings |
| `src/lib/platform-admin-queries.ts` | The one definition of "paying" and "trialling" |
| `src/app/platformadmin/pipeline/` | Stage columns, lead panel, quote tab |
| `src/app/platformadmin/trials/` | New screen |
| `src/app/platformadmin/customers/` | Was Clients; paying salons only |
| `src/app/platformadmin/packages/` | Was Plans; now plans + add-ons |
| `src/app/api/v1/admin/leads/quote/` | Saves a quote, priced on the server |
| `src/app/api/v1/admin/leads/convert/` | Lead → trial in one transaction |
| `src/app/api/v1/admin/add-ons/` | Add-on catalogue |

`/clients`, `/enquiries` and `/plans` are kept as redirects rather than deleted, so a bookmark still
lands somewhere sensible.

### Two rules worth keeping

**A quote is frozen when it is given.** The lead stores the packs *and the prices of that day*. If a
pack price changes next month, what this salon was told does not change with it.

**An add-on's `limitField` cannot change once anyone owns it.** Quietly turning someone's
appointment pack into a branch pack would be indefensible, so the API refuses.

---

## What this changes about numbers

- **MRR counts customers only.** Trials are ₹0 — that was already true and stays true.
- **MRR includes add-ons.** A ₹4,999 salon with ₹1,000 of packs is worth ₹5,999.
- **Expansion revenue becomes real.** Selling an add-on to an existing customer is the cheapest
  revenue there is, and it now shows up in net revenue retention where it belongs.
