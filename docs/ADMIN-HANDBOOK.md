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

---

## 2. The day starts on Today

**Today** is a queue, ordered by what it costs to ignore. Work top to bottom and you will not lose
a customer to neglect. The order is deliberate:

| Order | What | Why it's there |
|---|---|---|
| 1 | **Payment failed** | Money is leaking now. Longest-failing first. |
| 2 | **Branch waiting for approval** | The salon is **blocked** and can't use what they bought. Our fault, not theirs — this churns customers faster than any pricing mistake. |
| 3 | **Trial ending** | Money about to be lost. Call before it ends, not after. |
| 4 | **Renewal due** | Money to confirm. |
| 5 | **Never activated** | Signed up, never took a booking. Caught early it's a phone call; caught late it's a refund. |
| 6 | **Follow up a lead** | Money not yet won. |

An empty Today screen means everything is handled. That is the goal, not a bug.

---

## 3. Someone enquires — record it as a Lead

**Do not create a salon for someone who is only asking about price.** A half-real salon skews every
number we report — active salons, revenue, conversion rate.

**Clients → Enquiries → Add enquiry.** Capture salon name, contact, phone, and how many branches
and staff they have (that decides which plan you quote).

**Always set a follow-up date.** A lead with no next step is a lead being lost, and it will not
appear on Today without one.

Statuses move in one direction: **New → Contacted → Demo booked → Quoted → Won / Lost.**
Mark **Lost** honestly — a clean pipeline is more useful than a flattering one.

---

## 4. Onboarding a salon that says yes

**Create salon**, then:

1. **Salon name and legal name.** Legal name and GSTIN appear on *their* invoices — worth getting
   right at the start.
2. **Choose the plan** (see §5).
3. **Monthly or annual.** Annual is 20% cheaper for them, cash up front for us, and far less churn.
   Push it.
4. **Start the 14-day trial.**
5. **Invite the owner** — generates a link. Send it to them; they set their own password. We never
   know or set a salon's password.

Then tell them the first three things to do: add services, add staff, take a test bill. A salon
that bills on day one almost never churns.

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

**Plans → edit.** Prices are entered in rupees; the system stores them precisely.

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
