# Dedicated environments — a salon on its own database

For customers on the **Enterprise** plan: their data lives in a database they own, and their app
runs as its own deployment pointed at it. Operyx's shared instance never reads or writes their data;
the platform admin only stores where it is (encrypted) and can test that it's reachable.

**Why a separate deployment and not routing inside one app:** because "your data never touches our
server" must be literally true to be worth paying for. One app connecting to many customer databases
would still see everything; separate deployments make the promise a fact of architecture rather than
a policy.

---

## What was built

| Piece | Where |
|---|---|
| `TenantEnvironment` model — encrypted connection string, app URL, check state | `prisma/schema.prisma` |
| `requiresDedicatedDb` flag on plans; Enterprise plan seeded with it | `prisma/seed.mjs` |
| AES-256-GCM sealing, write-only credential, host-only display | `src/lib/secret-box.ts` (+ tests) |
| Save + test-connection API (reports reachability and latest migration) | `api/v1/admin/tenants/[tenantId]/environment` |
| "Their own database" card on the customer page, with drift warning | `environment-card.tsx` |

**New env var, required everywhere the main app runs:** `ENVIRONMENT_SECRET_KEY` — any string of
16+ characters. Add to `.env` and Vercel. Losing it means re-entering every stored credential
(annoying, not fatal — that trade is deliberate).

Run `npx prisma migrate dev --name tenant_environments` and `node prisma/seed.mjs`.

---

## Selling rules

- **Enterprise has no list price.** It is seeded at ₹0 and hidden from the pricing page. **Always
  set an agreed price on the subscription** — MRR uses agreed price, so forgetting it makes the
  customer worth ₹0 in every report until someone notices.
- Their AMC/subscription is what pays for migrations and support. No agreement, no updates —
  put it in the contract.
- **Default hosting: a ₹500/month DigitalOcean droplet in Bangalore, in their account** (see the
  recipe below). Supabase Pro (~₹2,200/mo) is the fallback for a customer who wants a managed
  service and will pay for it. A physical machine in the salon is never an offer.
- Bangalore matters: the app runs in Vercel's Mumbai region, and a POS checkout is many queries.
  A database in Singapore or Frankfurt makes billing feel slow at the counter, whatever the specs.

---

## Onboarding runbook — one salon, ~half a day

### 1. Their accounts, their names

1. They create (or you create *with their email as owner*): a **DigitalOcean** account and a
   **Vercel** account. Ownership is the product here — do not shortcut it by using Operyx accounts.
2. Card on file is theirs. The ₹500/month is their bill, on their statement — that is the point.

### 1b. The database VPS — DigitalOcean recipe (~20 minutes)

1. In their DO account: **Create → Droplet** — region **Bangalore (BLR1)**, image **Ubuntu 24.04**,
   size **Basic / Regular / $6-mo** (1 vCPU, 1 GB). Enable **weekly snapshot backups** (~$1.20/mo)
   — that is the disaster layer under the nightly dumps.
2. SSH in, then follow **`deploy/dedicated-db/README.md`** in this repo: install Docker, copy the
   four files, generate the password, `docker compose up -d`, set the firewall, run the restore
   rehearsal. All commands are copy-paste.
3. The connection string for everything that follows:
   `postgresql://operyx:<password>@<droplet-ip>:5432/operyx`
4. The password travels through something ephemeral — not email, not WhatsApp history.

### 2. Deploy

1. New Vercel project from the same GitHub repo (grant their Vercel account read access to the
   repo, or push a mirror — mirror is cleaner if the deal ever ends).
2. Environment variables: same set as production, except `DATABASE_URL` and `DIRECT_URL` are
   **both the droplet connection string** (no pooler on a VPS; none needed at one salon's load).
   `ENVIRONMENT_SECRET_KEY` and auth secrets **freshly generated** — never reuse production's.
3. First deploy runs `prisma migrate deploy` via the build (already configured in `package.json`).
4. Seed: run `node prisma/seed.mjs` against their `DIRECT_URL` with `SEED_OWNER_PASSWORD` /
   `SEED_ADMIN_PASSWORD` set to throwaway values they must change on first login.

### 3. Record it in the platform admin

1. Create the salon (or convert their lead) and assign the **Enterprise** plan **with the agreed
   price**.
2. The customer page now shows the "Their own database" card. Enter their connection string
   (sealed on save, never visible again), their app URL, who hosts it, notes.
3. Click **Test connection** — expect *Reachable* and the latest migration name.

### 4. Hand over

- They change the seeded passwords.
- They confirm they can see the droplet in their own DigitalOcean account and log into it — that is
  the "your data is yours" moment; make them do it, not you.
- The backup story is already running: nightly dumps on the droplet (14 kept) + weekly DO
  snapshots. The remaining agreement, **in writing**: once a month someone copies the newest dump
  off the droplet, and whose job that is. A backup on the same disk as the database protects
  against mistakes, not against the disk.

---

## Releasing updates to dedicated customers

Every release now has a fan-out step:

1. Ship to Operyx production first; let it soak a day.
2. For each dedicated customer: their Vercel project redeploys from the same commit (automatic if
   tracking `main`, manual promote if pinned — pin customers who fear change).
   `migrate deploy` runs on their database as part of the build.
3. In the platform admin, open each Enterprise customer and click **Test connection** — the card
   shows *Up to date* or *Behind* by comparing their latest migration to the codebase's.

The card's drift warning exists because the alternative is a customer reporting a bug that was
fixed two versions ago, and nobody being able to say so.

## Rules that keep this honest

- The credential is **write-only**: it can be replaced, never viewed. What support sees is the host
  name.
- The sealed credential is opened in exactly one code path — the connection test. Adding a second
  place that opens it should be treated as a design smell and reviewed hard.
- Never run `prisma migrate dev` against a customer database. `migrate deploy` only, via their
  build. `dev` can reset data; `deploy` cannot.
- At most a handful of these customers. Every one adds a database to the release fan-out, forever.
  When the count feels heavy, raise the Enterprise price rather than the count.
