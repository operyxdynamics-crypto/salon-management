# Environments — local vs live

## The rule

**Your laptop can never reach live customer data.**

| | Database | Env lives in | How often you change it |
|---|---|---|---|
| **Local** | Postgres on your machine | `.env` (gitignored) | Once. Then never. |
| **Production** | Supabase `ooywdoremwaspkykyfme` | Vercel env vars | Once. Then never. |

Set each once and you stop swapping env values — which is what today's `P1000 / P1001` merry-go-round
actually was. More importantly, the separation is *physical*: `migrate reset`, `seed.mjs`, and any
half-finished experiment cannot touch a real salon, because your machine has no route to that
database at all. Discipline fails; wiring doesn't.

This is why the earlier `ECIRCUITBREAKER` happened: one database served both the live site and the
laptop, so rotating its password broke the live site, which then hammered Supabase with stale
credentials until it locked *everyone* out — including the developer who caused it.

---

## One-time local setup

**1. Create the database.** In pgAdmin (or `psql`):

```sql
CREATE DATABASE operyx_dev;
```

**2. Point `.env` at it.** Both URLs are identical locally — there is no pgBouncer in front of a
local server, so pooled and direct are the same connection. They only differ in production.

```
DATABASE_URL="postgresql://postgres:YOURLOCALPASS@localhost:5432/operyx_dev?schema=public"
DIRECT_URL="postgresql://postgres:YOURLOCALPASS@localhost:5432/operyx_dev?schema=public"
AUTH_SECRET="any-long-string-is-fine-locally"
```

`DIRECT_URL` must still be set: the Prisma CLI reads it for `migrate` and `studio`.

**3. Build the schema and demo data.**

```
npx prisma migrate deploy
node prisma/seed.mjs
node prisma/backfill-invoice-codes.mjs
```

Sign in as `owner@operyx.demo`. The seed password is the dev default unless you set
`SEED_OWNER_PASSWORD`.

That's it. `.env` never changes again.

---

## Day-to-day: how a change reaches customers

Production only moves when you **merge to `main`**. Pushing a branch just gives you a preview.

```
git checkout -b invoice-share      # 1. branch
npm run dev                        # 2. build it against LOCAL postgres
npm run lint && npm run typecheck && npm test && npm run build
git push origin invoice-share      # 3. Vercel builds a PREVIEW url - live site untouched
```

Open the Preview URL Vercel comments on the branch. It runs the real production database, so it is
the honest test. When it is right:

```
git checkout main && git merge invoice-share && git push origin main   # 4. now it is live
```

**Never `git push origin main` directly again.** That is what put an untested change one keystroke
away from a salon mid-shift.

### Migrations are the one thing to think about

A branch preview and production share the same database, so a migration merged to `main` applies on
deploy and cannot be un-applied by rolling back the code. Keep migrations **additive** — add a
nullable column, backfill it, then start reading it — rather than renaming or dropping in one step.
`prisma migrate dev` is for your local database only; production only ever runs
`prisma migrate deploy`, which never generates or resets.

---

## What lives where

| Variable | Local | Production |
|---|---|---|
| `DATABASE_URL` | localhost:5432 | Supabase pooler **6543** + `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | localhost:5432 | Supabase pooler **5432** |
| `AUTH_SECRET` | anything | 32+ random chars, set once, never changed (changing it signs everyone out) |
| `STORAGE_PROVIDER` | unset (`local`) | `s3` — serverless discards its filesystem |
| `CHROME_PATH` | only if the PDF route cannot find Chrome | **never set** — production uses bundled Chromium |

Nothing reads `NEXT_PUBLIC_APP_URL`, `ROOT_DOMAIN`, `MESSAGING_PROVIDER`, or
`OBJECT_STORAGE_PROVIDER`. They are leftovers; delete them from Vercel.

---

## When you do need production data locally

Don't point `.env` at Supabase — that is the trap this whole document exists to close. Instead pull
a copy:

```
pg_dump "POSTGRES_CONNECTION_STRING" > backup.sql
psql -d operyx_dev -f backup.sql
```

Remember it is then real customer data on a laptop. Delete it when you are done.
