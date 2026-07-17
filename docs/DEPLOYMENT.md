# Going live — Vercel + Supabase

Stack: Next.js on Vercel, Postgres on Supabase (ap-south-1), Prisma as the ORM.

---

## 0. Rotate the database password first

If the password has ever been pasted into a chat, a screenshot, a ticket, or a spreadsheet shared
with anyone, treat it as public. Supabase → **Project Settings → Database → Reset database
password**. Put the new one straight into Vercel; never into a file in the repo.

`.env` must never be committed. Confirm with `git check-ignore .env` (it should print `.env`).

---

## 1. Environment variables

Set these in Vercel → **Settings → Environment Variables**, for *Production* and *Preview*.
Nothing here belongs in the repository.

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | Supabase **pooler**, port **6543**, with `?pgbouncer=true&connection_limit=1` | The app runs through pgBouncer. Serverless spawns many short-lived instances; without the pooler they would each open a real Postgres connection and exhaust the limit. |
| `DIRECT_URL` | Supabase **direct**, port **5432** | Migrations need advisory locks and DDL in a transaction, which a transaction pooler cannot do. This is why `migrate dev` hangs on 6543. |
| `AUTH_SECRET` | `openssl rand -base64 32` | Signs session cookies. The app refuses to boot in production without it. Changing it signs everyone out. |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` | Used to build absolute links. |
| `ROOT_DOMAIN` | your domain | Tenant/branch public pages. |
| `STORAGE_PROVIDER` | `s3` | **Not `local`.** A serverless filesystem is discarded between invocations, so uploads written to disk vanish. |
| `S3_*` | Supabase Storage S3 credentials | See `.env.example`. Supabase Storage speaks the S3 API. |

Do **not** set `CHROME_PATH` or `CHROME_CHANNEL` in production — those are the local-development
escape hatch. Production uses the bundled Chromium.

---

## 2. What the build does

`package.json` runs:

```
build: prisma migrate deploy && next build
```

`migrate deploy` applies committed migrations and **never** generates or resets — unlike
`migrate dev`, which is a development-only command and must never run against production data.

If a migration fails, the build fails and the old deployment keeps serving. That is the desired
behaviour: shipping code ahead of its schema is what produced the `Unknown field invoiceCode`
class of error locally.

`postinstall: prisma generate` keeps the client in step with the schema on every install.

---

## 3. The invoice PDF route

`/api/v1/operations/invoices/[invoiceId]/pdf` renders the invoice with headless Chromium.

- `next.config.ts` lists `@sparticuz/chromium` and `puppeteer-core` in `serverExternalPackages`.
  Chromium is a ~50MB binary, not JavaScript; if the bundler traces it the route breaks.
- `vercel.json` gives that one function **1769MB** and **60s**. Chromium will not start in the
  default 1024MB, and a cold start plus render exceeds a 10s limit.
- `maxDuration: 60` needs a **Pro** plan. On Hobby the cap is lower and the first PDF of a cold
  container may time out. If you stay on Hobby and PDFs are flaky, that is the reason — not a bug.
- The route is `runtime = "nodejs"`. Chromium cannot run on the edge runtime.

---

## 4. Region

`vercel.json` pins functions to `bom1` (Mumbai) because Supabase is in `ap-south-1`. Every request
here makes several database round trips; putting the functions in Washington and the database in
Mumbai adds ~200ms *per trip*. Keep them in the same region.

---

## 4b. Storage (Supabase Storage over the S3 API)

`STORAGE_PROVIDER=local` writes to `.data/uploads` on disk. A serverless filesystem is discarded
between invocations, so those files disappear — silently, and usually weeks later when someone
looks for a verification document. Production must use `s3`.

Supabase Storage speaks the S3 API, so no extra vendor is needed:

1. Supabase → **Storage → New bucket**. Name it `operyx`. Keep it **private** — the app hands out
   short-lived presigned URLs (`signedObjectUrl`, 300s); a public bucket would make every uploaded
   ID document world-readable.
2. Supabase → **Project Settings → Storage → S3 Access Keys** → generate one. You see the secret
   once.
3. Set in Vercel:

   | Variable | Value |
   |---|---|
   | `STORAGE_PROVIDER` | `s3` |
   | `S3_ENDPOINT` | `https://<project-ref>.supabase.co/storage/v1/s3` |
   | `S3_REGION` | `ap-south-1` (must match the project) |
   | `S3_BUCKET` | `operyx` |
   | `S3_ACCESS_KEY_ID` | from step 2 |
   | `S3_SECRET_ACCESS_KEY` | from step 2 |
   | `S3_FORCE_PATH_STYLE` | `true` — Supabase needs path-style; without it the SDK builds
     `bucket.host` URLs and every upload 404s |

---

## 4c. Seeding — read before running

`prisma/seed.mjs` builds a **demo** salon: fake branches, services, customers. It is for
development. Do not point it at a database that will hold real customers.

The passwords now come from `SEED_OWNER_PASSWORD` and `SEED_ADMIN_PASSWORD`. In production the seed
throws rather than fall back to a default — a password committed to the repo is a published
password, and it previously created a `PLATFORM_ADMIN` whose credentials anyone reading the source
would know.

If you seeded any real environment before this change, treat `admin@operyx.demo` as compromised:
change its password, or delete the account.

For a real first tenant, prefer creating the owner through onboarding and deleting the demo data.

---

## 5. First deploy

1. Push to GitHub; import the repo in Vercel.
2. Add the environment variables above **before** the first build — the build runs migrations and
   will fail without `DIRECT_URL`.
3. Deploy. Watch the log for `migrate deploy` applying migrations.
4. Seed the first tenant/owner (see `prisma/seed.mjs`), then sign in and change the password.
5. Smoke test, in this order — each depends on the last:
   - Sign in
   - Home loads with real numbers
   - Take a sale end-to-end → invoice opens
   - **Download A4 and A5** (this is the Chromium path; it is the most likely thing to fail)
   - Refund a bill

---

## 6. Known limits

- **Supabase free tier pauses** after inactivity. The first request then takes seconds or fails
  outright — which looked exactly like a code bug during development. On a paid tier it does not
  pause.
- **Cold starts.** The first PDF after idle pays the Chromium start-up cost. Later ones are fast.
- **`STORAGE_PROVIDER=local` silently loses files** on serverless. It must be `s3` in production.
- **Backups.** Supabase free tier keeps limited backups. A salon's invoice history is a legal
  record — check the retention on your plan before real customers rely on it.
