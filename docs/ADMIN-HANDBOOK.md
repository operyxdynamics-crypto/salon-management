# Operyx admin panel — team handbook

For everyone at Operyx who sells to, onboards, or supports salons.
No technical knowledge assumed. If something here doesn't match what you see on screen, the screen
is right and this document is out of date — tell the team.

**Where:** `myhub.operyx.in/platformadmin` · sign in with your Operyx email.

---

## 1. What this panel is

This is **our** control room, not a salon's. Two different products, easy to confuse:

| | Who uses it | What it does |
|---|---|---|
| **Admin panel** (`/platformadmin`) | Operyx staff | Sell, onboard, bill and support salons |
| **Salon workspace** (`/workspace`) | The salon's own team | Bookings, billing, stock, staff |

A salon owner can never see the admin panel. You can never see a salon's customer data from here —
only whether they're paying, how much they use it, and whether they need help.

### The seven screens

| Screen | Who is on it | The question it answers |
|---|---|---|
| **Today** | anything needing action | What will hurt if I ignore it? |
| **Pipeline** | leads, demos, quotes | Who am I about to win? |
| **Trials** | salons trialling now | Who is about to convert or slip away? |
| **Customers** | paying salons only | Which of my customers is in trouble? |
| **Money** | — | Am I growing or shrinking? |
| **Packages** | plans + add-ons | What do we sell? |
| **Activity** | — | Who did what? |

**A salon appears on exactly one of Pipeline, Trials and Customers at a time.** A trialling salon is
never listed as a customer — it is not paying us anything, and counting it as one would mean two
screens giving different answers to "how many customers do we have?"

---

## 2. The day starts on Today

**Today** is a queue, ordered by what it costs to ignore. Work top to bottom and you will not lose
a customer to neglect. The order is deliberate:

| Order | What | Why it's there |
|---|---|---|
| 1 | **Payment failed** | Money is leaking now. Longest-failing first. |
| 2 | **Branch waiting for approval** | The salon is **blocked** and can't use what they bought. Our fault, not theirs — this churns customers faster than any pricing mistake. |
| 3 | **At limit** | A paying salon has hit a ceiling and **cannot take a booking right now**. Sell them the add-on today; the alert tells you which one and what it costs. |
| 4 | **Trial ending** | Money about to be lost. Call before it ends, not after. |
| 5 | **Renewal due** | Money to confirm. |
| 6 | **Never activated** | Signed up, never took a booking. Caught early it's a phone call; caught late it's a refund. |
| 7 | **Near limit** | Nothing is wrong yet — they're at 80%+ of something. The easiest sale you will make all week. |
| 8 | **Follow up a lead** | Money not yet won. |

An empty Today screen means everything is handled. That is the goal, not a bug.

---

## 3. Someone enquires — record it as a Lead

**Do not create a salon for someone who is only asking about price.** A half-real salon skews every
number we report — active salons, revenue, conversion rate.

**Pipeline → Add lead.** Capture salon name, contact, phone, where they came from, and how many
branches and staff they have. **Ask for the size on the first call** — it is what decides the quote,
and ringing back to ask is a wasted call.

**Always set a follow-up date.** A lead with no next step is a lead being lost, and it will not
appear on Today without one. The Pipeline header counts these for you.

The columns are the conversation: **New lead → Contacted → Demo → Quoted → Won**, with **Lost**
tucked away behind a toggle. Click any card to open it: phone number at the top to call them, stage
and notes on the left tab, the quote builder on the right.

Mark **Lost** honestly, and write the reason in the notes. Whether we lose on price, on features or
on slow follow-up are three different problems with three different fixes, and we can only tell them
apart if the reasons are written down.

### Quoting

Open the lead → **Quote** tab. Pick the base plan, click the packs up and down, and the total
recalculates with GST as you go. Every line shows its own arithmetic — "2 × 500" — so you can read
it down the phone and the owner can check it.

If the plan you have picked is too small for the size on record, the builder says so before you
quote it. Selling a salon a plan that cannot hold their branches is the fastest way to a refund
request.

**Save quote** records it against the lead with today's prices and moves them to Quoted. When they
ring three weeks later asking what you said it was, the answer is on the record rather than in
someone's memory.

---

## 4. They say yes — start the trial

**Do not use Create Salon for a lead you have been working.** Open the lead in Pipeline and use the
**Start trial** tab. Everything is already there: salon name, city, phone, the plan you quoted and
the add-ons you quoted with it. Retyping it into a separate form is where the quote and the
subscription drift apart, and nobody notices until the first invoice is wrong.

It asks for two things, because they are the only two you do not already have written down:

1. **Owner's name.**
2. **Owner's email.** Check this one twice — it decides who gets the keys to the account.

Trial length defaults to the plan's own. Override it only if you actually negotiated something.

**Copy the invitation link before you close the panel.** It is shown once and cannot be retrieved,
only reissued. Send it to the owner; they set their own password on it. We never know or set a
salon's password.

### This creates a trial, not a customer

The salon moves from Pipeline to **Trials**. It adds nothing to MRR until you mark it paid. Selling
and getting paid are two different events, and every number we report depends on not confusing them.

Then tell them the first three things to do: add services, add staff, take a test bill. A salon
that bills on day one almost never churns — and Trials shows you at a glance which ones haven't.

### Their branch needs approving

New branches arrive as **Pending**. Open the salon, check the checklist is complete, and
**Approve & publish**. Until you do, they cannot go live. This is the fastest thing on the list to
do and the most damaging to leave.

---

## 5. The plans

Prices **exclude 18% GST**, which is how competitors quote. Annual saves 20%.

| | **Salon** | **Group** | **Franchise** |
|---|---|---|---|
| Monthly | ₹1,999 | ₹4,999 | ₹11,999 |
| Annual (per month) | ₹1,599 | ₹3,999 | ₹9,599 |
| Branches | 1 | 5 | Unlimited |
| Staff | 15 | 50 | Unlimited |
| Attendance + payroll | ✓ | ✓ | ✓ |
| Multi-branch reporting | — | ✓ | ✓ |
| Franchise (COCO/FOCO/FOFO), multiple GSTINs | — | — | ✓ |

**Quote on staff count and branches** — those are the limits the system actually enforces.

### What to say when they compare us to cheaper software

Don't argue on price. We are more expensive on purpose. Two things competitors cannot match:

- **The GST is real.** Supplier GSTIN, place of supply, HSN/SAC on every line, correct CGST/SGST or
  IGST, and invoice numbers that are unique per branch per year and within the legal 16-character
  limit. Most salon software prints a total and calls it a tax invoice. Ask if their accountant has
  ever complained at filing time — that question sells the product.
- **Franchise actually works.** A FOFO franchisee bills under *their own* GSTIN and their revenue
  never lands in the parent company's books. No competitor at any price does this. For a franchise
  group, the alternative is a spreadsheet and an accountant, which costs far more than ₹11,999.

Attendance with geofencing and payroll is included in every plan. Zylu charges ₹499–999/month extra
for theirs.

---

## 6. Taking money (until the payment gateway is live)

Right now we invoice and collect by bank transfer. The panel tracks it.

1. Agree the plan and period.
2. If you agreed a **discount**, enter it in **Agreed price**. Do not skip this — our revenue
   figures must reflect what a salon actually pays, not a list price nobody was charged.
3. Send the invoice. **We owe 18% GST on our own revenue**, and they will ask for our GSTIN so they
   can claim input credit.
4. When the transfer lands: **Mark paid.** This sets what they've paid up to, and Today will remind
   you before it runs out.

**If a payment fails:** press **Payment failed**. Nothing switches off immediately —

- **Days 1–7:** full access, with a warning shown to them.
- **Days 8–14:** read-only. They can see and export everything, but not take new bills.
- **After 14:** suspended.

**A salon never loses read access to its own records, even suspended or cancelled.** Their invoices
are legal records they are required to keep. We do not hold them hostage. Say this plainly if
anyone asks — it is a genuine reason to trust us.

---

## 7. Changing a plan

Open the salon → Subscription → pick the plan → **Save plan**.

**Upgrades** are instant. **Downgrades are refused if the salon is already over the new plan's
limits** — e.g. moving a 3-branch salon onto Salon (1 branch). The message says exactly what is
over. Ask them to reduce first, or keep them where they are.

---

## 8. Changing prices

**Packages → Base plans → Edit.** Prices are entered in rupees; the system stores them precisely.

**Changing a list price never re-prices existing customers.** A salon that agreed ₹1,999 keeps
paying ₹1,999 until someone changes *their* subscription. Silently repricing live customers because
a list price moved would be indefensible.

Set a limit to **0** to mean **unlimited**.

---

## 9. Money

**Money** shows what matters each morning:

- **MRR** — monthly recurring revenue. Annual customers are divided by twelve so everyone is
  comparable. **Trials count as ₹0** — they are pipeline, not revenue, and counting them would
  flatter the one number that must stay honest.
- **At risk** — failing, expiring, and renewing in the next 7 days.
- **By plan** — where revenue actually comes from.

---

## 10. Things not to do

- **Don't create a salon for a prospect.** Use an enquiry.
- **Don't seed demo data into a real salon's account.** It's for testing only.
- **Never ask a salon for their password.** We cannot see it and never need it. If they're locked
  out, the owner resets it from their own Team screen.
- **Don't promise a feature that isn't built.** If unsure, ask — a missed expectation costs more
  than a lost sale.
- **Don't leave a branch pending overnight.** They are blocked until you approve it.

---

## 11. Common questions from salons

**"Can we try it first?"** — Yes, 14 days, no card. We can extend by 7 days if they're mid-setup.

**"Can we move our existing customer data in?"** — Talk to the team. Not self-serve.

**"What if we stop paying?"** — Access winds down over two weeks and their records stay readable.
Nothing is deleted.

**"Do you take a commission on our bookings?"** — No. The subscription is the only charge.

**"Is our customer data private?"** — Yes. Each salon's data is separate; other salons cannot see
it. Operyx staff can see subscription and usage information, not their customer list.

**"Do you have an app?"** — It installs on a phone or tablet from the browser and works like an app.
