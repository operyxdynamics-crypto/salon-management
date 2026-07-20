# Roadmap — from built to sold

Written 20 July 2026, after the platform-admin V2 rebuild and the competitor research in
[COMPETITORS.md](./COMPETITORS.md). Decisions already taken: booking ceilings raised to 3,000/15,000;
work proceeds on **two tracks in parallel** — getting live and selling, while closing feature gaps
behind it; the UI/UX pass covers the demo path, the whole salon workspace, and the platform admin.

The one rule for running two tracks at once: **nothing half-finished is ever visible in a demo.**
A feature ships behind a capability flag or it waits.

---

## Track A — Go live and sell

Nothing else in this document matters until a prospect can reach the product.

### A1. Unblock the deploy *(days, and it is all configuration)*

1. **Vercel `DATABASE_URL` / `DIRECT_URL`** — still showing "Added Jul 1", from before the password
   rotation. Update both, redeploy. This is the single blocker for everything.
2. Smoke test on `myhub.operyx.in`: login, create a booking, take a payment, open the invoice PDF,
   staff check-in. The five things a demo does.
3. Run the seed against production so the three plans and four add-on packs exist with the new
   ceilings.
4. `.env` on the laptop still points at production — swap to the dev database and keep it there.
   One accidental `migrate dev` against live data ends worse than any missed deadline.

### A2. Sales readiness *(week 1–2)*

- **Submit the WhatsApp OTP template to Meta now** (docs/WHATSAPP-OTP-TEMPLATE.md). Business
  verification takes days and blocks all WhatsApp work in Track B. Cheapest thing on this page to
  start today.
- **Put pricing on the landing page.** ReSpark hides theirs; ours in the open is a stated
  advantage — but only if it is actually published.
- **The 20-call GST test** (COMPETITORS.md §6). Every lead gets asked: *"When your CA files your
  GST return, where do the numbers come from?"* Twenty answers decide whether the pitch leads with
  compliance or with franchise structure. No code, highest-information action available.
- Demo script: 20 minutes, in the order of the demo-path polish below, ending on the invoice PDF —
  the thing no competitor can show.

---

## Track B — Feature gaps, in evidence order

From the competitor research. Each item ships complete or stays flagged off.

| # | What | Why | Size |
|---|---|---|---|
| B1 | **WhatsApp wired end-to-end** — OTP login, booking confirmation, invoice link | Both India competitors have it native. Table stakes, and reminders are what actually cut no-shows. Blocked on Meta verification → start A2 today | M |
| B2 | **Shared-service incentive split** — N staff on one appointment, commission split by pre-set rules | ReSpark's sharpest weapon; real bridal/spa problem; will come up in demos. `AppointmentServiceLine` already exists — the schema is closer than it looks | M |
| B3 | **Tender split surfaced in invoice detail + refund UI** | Old task #6, still open. The data exists; the screen doesn't show it. Small and demo-visible | S |
| B4 | **Birthday automation** | Both competitors have it, trivially demoable, and it rides on B1's WhatsApp plumbing | S |
| B5 | **Family/shared and hourly plans** | Only if spa leads appear in the pipeline. Let Track A's leads decide | L |
| B6 | **Offline billing** | ReSpark advertises it because Indian salons lose internet. Investigate a service-worker queue for the POS only — do not attempt full offline sync | L |
| B7 | Customer mobile app | Last. Mobile-web booking covers most of it; nobody switches software for an app | XL |

---

## Track C — the UI/UX pass

### C0. The structural finding

**The salon workspace is one page pretending to be seventeen.** Every route under `/workspace/*` is
a 7-line stub delegating to a single `WorkspacePage` module-switcher, which pulls in ~8,000 lines of
client modules — `pos.tsx` alone is 1,065 lines, `billing.tsx` 857, `overview.tsx` 655.

Consequences, all user-visible:

- First paint loads code for screens the user never opens. A receptionist opening POS pays for
  reports, marketing and masters too.
- Loading states are per-workspace, not per-screen — everything shares one spinner.
- The browser back button and deep links work only as well as the switcher remembers to sync the
  URL (the invoice deep-link bug from last week was exactly this class of failure).

**This is the same disease the platform admin had, and the same cure applies:** real routes, each
loading only its own module. The platformadmin split is the template — do it incrementally, one
module per PR, POS first (biggest bundle, most demo-visible), no big-bang rewrite.

### C1. Global patterns (both apps)

| Pattern today | Replace with | Why |
|---|---|---|
| `window.location.reload()` after every save (all platform-admin components, several workspace modules) | `router.refresh()` + optimistic UI or a toast | A full reload flashes white, loses scroll, and re-fetches the world to change one row. In a demo it reads as "slow software" |
| Silent success — the save happened, nothing said so | Small toast, auto-dismiss | Salon staff work fast; without confirmation they click twice |
| Spinners with no shape | Skeletons matching final layout | Perceived speed is the only speed a demo has |
| Empty states that say "No X yet" | Empty states with the next action: "No bookings today — **+ New booking**" | Every empty screen in a trial is a decision point: continue or abandon |
| Errors as raw messages | What happened + what to do next | "Unique constraint failed" cost a support call once already |
| Confirm dialogs via `confirm()` | Consistent modal in the design system | Native dialogs look broken next to a styled app |

### C2. Demo path, screen by screen — the order a prospect sees them

1. **Landing page** — add the pricing section (Track A2). Add one screenshot of the invoice PDF;
   the wedge should be visible before a single call.
2. **Login** — already rebranded. Add WhatsApp OTP once B1 lands; until then make the password path
   flawless on a phone.
3. **Home / Today** — the first screen after login and the first "wow" chance. Audit: does it load
   under a second on a seeded salon? Do the queue cards navigate correctly since the route changes?
4. **Bookings** — the calendar is the screen owners judge everything by. Verify drag/create on a
   tablet — demos happen on iPads across a counter. Colour by status must match the legend.
5. **POS checkout** — the money screen and the biggest module. Number-pad-first entry; coupon and
   membership application visible, not buried; tender split obvious. After C0, this loads alone.
6. **Invoice** — the differentiator. A4/A5 with Download/Print/Share already built. Print CSS must
   be verified on a physical printer before the first demo — print bugs are invisible until they
   are fatal.
7. **Attendance** (staff phone) — geofenced check-in is a live-demo set piece: check in from the
   prospect's own salon during the meeting. The clock screen must be perfect on a cheap Android in
   sunlight: big button, obvious state, forgiving of GPS wobble (already never blocks — show that).
8. **Reports** — owners buy reports. Make the first chart land within a second; skeleton the rest.

### C3. Salon workspace, the rest

- **Masters** — dense and functional is fine, but tab labels must match the sidebar's vocabulary
  everywhere (Products / Services / Offers regrouping is done; verify no stale names in
  `domain-tabs.tsx`).
- **Stock** — audit against ReSpark's inventory story: low-stock alert must be visible on Home,
  not buried in a report.
- **Team** — roles UI is built; the payslip view is what an owner shows their accountant. Same
  print-CSS rule as invoices.
- **Settings / Company profile** — the GSTIN and legal-entity screens are the compliance story.
  A prospect's accountant will look at exactly this screen; it must not look like an afterthought.
- **Day close** — the last screen every salon sees every night. Worth a polish pass purely for
  daily-habit goodwill.
- **Style guide page** — internal; exclude from any prospect-visible build.

### C4. Platform admin

- Replace the reload-after-save pattern (C1) across `plans-editor`, `add-ons-editor`,
  `pipeline-board`, `client-detail`.
- Delete the orphaned `enquiry-board.tsx`.
- The Pipeline board scrolls horizontally on a laptop — five columns need ~1,100px. Collapse Won
  into a header chip; it's an exit, not a working column.
- Trials table: "No end date set" rows sort last but render mid-table on second load — verify the
  sort is stable.
- Quote builder: quantity steppers are mouse-only; add keyboard entry for phone-call speed.

### C5. Mobile, the honest version

Two personas, two different bars:

- **Staff on a phone** — attendance clock, their calendar, today's appointments. This must be
  excellent; it is used 2× a day by every employee.
- **Owner on a phone** — Home, reports, approvals. This must be *usable*; owners check from home.
- **Reception on a tablet** — POS and bookings. Test on an actual iPad, not a resized window.

Everything else can be desktop-first without apology.

---

## Sequencing the parallel tracks

| Week | Track A (live + sell) | Track B (features) | Track C (UX) |
|---|---|---|---|
| **1** | Vercel envs, deploy, smoke test, prod seed. Submit WhatsApp template. Pricing on landing page | — | C1 patterns in platform admin (small, self-contained, proves the pattern) |
| **2** | First demos with what exists. Start the 20-call test | B3 tender split (small, demo-visible) | C2 demo path: POS + invoice print verification |
| **3** | Demos continue; log every objection verbatim | B1 WhatsApp (if Meta verified) | C0 route split, POS module first |
| **4** | 20-call verdict → pitch adjusted | B2 incentive split | C2 remainder: bookings, attendance, reports |
| **5+** | Convert first trials | B4, then B5/B6 by lead evidence | C3/C5 by what demos exposed |

The ordering principle: **demo feedback drives everything after week 2.** The 20 calls and the
first demos will re-rank Track B and C better than any document written before meeting a customer —
including this one.

---

## Already decided, so nobody re-litigates

- Booking ceilings: 3,000 / 15,000 / unlimited. Never a ceiling a real customer can reach.
- No free tier. 14-day trial with a deadline, no card.
- No price competition below ₹1,599/mo. The cheap end churns most and demands most.
- Trials are never customers. One salon, one list, everywhere in the product.
- Quotes freeze at the day they are given. Prices change forward, never backward.
