# Platform admin — what a SaaS CEO actually needs

Written by asking: if I ran Operyx and could open one screen each morning, what would tell me
whether the business is working, and what would let me fix it before lunch?

---

## The honest gap

What we've built so far is an **admin panel** — it can create a salon, assign a plan, take a
payment. Useful, and not the same thing as a **business operating system**.

Three things are missing that a CEO would notice inside a week:

### 1. Churn is invisible

We report MRR. We do not report the number that decides whether the company survives.

In SaaS, **churn is the business.** At ₹2,000/month, losing three salons a month means you must win
three just to stand still. A dashboard showing MRR going up while 20% of customers leave each
quarter is a dashboard that lies by omission — the growth is real and the company is dying.

**Needed:** cancellations this month, churn rate (customers and revenue), and *why* they left.
A cancellation reason field is one dropdown and it is the most valuable data the company will ever
collect.

### 2. There is no early warning

"Never activated" catches a salon that never started. Nothing catches the far more common death:
a salon that used it happily for four months, then quietly stopped.

By the time they cancel, they left weeks ago. **Every churn is preceded by a usage decline that was
visible and unwatched.**

**Needed — a health signal per salon:**

- Bills raised in the last 7 days vs the 7 before
- Days since the last invoice
- Staff who have logged in this week
- Branches actually taking bookings

A salon whose weekly bills halve is a phone call today, not a cancellation next month. This is the
single highest-value thing on this list.

### 3. Support has no tools

A salon phones: *"the GST on my invoice is wrong."* Right now you can see their plan and their
branch count. You cannot see their tax settings, their last invoice, or what they actually did.

**Needed:** a support view per salon — recent invoices, recent errors, current settings — and,
carefully, **view-as** so you can see what they see. That must be read-only, logged, and obvious to
both sides; anything else is a privacy problem wearing a helpful hat.

---

## What I would ship, in order

### Now — before the first paying customer

| Section | Why |
|---|---|
| **Today** | The work queue. Built. |
| **Clients** | Every salon, their subscription, health, and a support view. |
| **Enquiries** | Pipeline. Built. |
| **Money** | MRR, **churn**, at-risk, revenue by plan. |
| **Plans** | Prices without a deploy. Built. |
| **Activity** | Who did what. Built. |

### Immediately after — because it's legally required

**Our own GST invoices.** The moment Operyx takes money it owes 18% GST and must issue tax invoices
with our GSTIN and SAC 998314. Customers will ask, because they claim input credit on it. We
already built this engine for salons; pointing it at ourselves is a day's work and skipping it is
not an option.

### Once there are ~20 customers

- **Feature adoption** — which features are used. Decides the roadmap with evidence instead of
  opinion, and shows which plan features actually justify their tier.
- **Announcements** — one message to every salon. Needed the first time there's downtime.
- **Cohort retention** — do salons onboarded in March survive better than January's? Tells you
  whether onboarding changes worked.

### Deliberately not yet

- **Roles inside the admin panel.** A team of 1–5 does not need them, and building a second
  permission system to guard a room you're all sitting in is wasted effort. Add when someone is
  hired who should *not* see revenue.
- **Automated dunning emails.** Twenty customers is a phone call, and the phone call teaches you
  why they didn't pay. Automate at a hundred.
- **In-app chat.** WhatsApp already exists and salons already use it.

---

## The one number per screen

Each section should answer one question, in the largest text on the page:

| Section | The question |
|---|---|
| Today | What will hurt if I ignore it? |
| Clients | Which of my customers is in trouble? |
| Enquiries | Who am I about to win? |
| Money | Am I growing or shrinking? |
| Plans | What are we selling? |

If a screen can't answer its question at a glance, it's decoration.

---

## Two decisions worth being deliberate about

**Health scores must not be presented as certainty.** "At risk" from usage data is a hypothesis, and
treating it as fact means calling a customer who is fine and irritating them. Show the *evidence*
("bills down from 40 to 9 last week"), not a score out of 100.

**View-as is a privilege, not a feature.** Read-only, always logged, and the salon should be able
to see that it happened. A salon's customer list includes phone numbers and visit history of real
people who never agreed to Operyx staff browsing it. Being able to help is not the same as being
entitled to look.
