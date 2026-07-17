# Operyx

Operyx is an India-first salon marketplace and multi-tenant operations portal built with Next.js, TypeScript, PostgreSQL, and Prisma.

## Current capabilities

- Customer marketplace discovery and database-backed booking
- Salon self-registration and admin-created owner invitations
- Guided business, branch, operating-hours, services, policies, and document onboarding
- Private verification files with signed access and local/S3-compatible object storage
- Branch-level review, correction, approval, publication, suspension, and history
- Admin-assigned subscription plans with enforced branch, service, staff, appointment, and storage limits
- Platform dashboards, tenant controls, support notes, reporting, and searchable audit history
- Multi-branch owner dashboard with branch-scoped operations and assigned staff access
- Protected salon workspace with PostgreSQL-backed appointments, customers, services, staff, stock, expenses, POS, and reports
- Interactive appointment timeline with staff reassignment and conflict-safe rescheduling
- Customer CRM with preferences, consent, tags, allergies, loyalty adjustments, and branch-filtered history APIs
- Memberships, prepaid packages, gift cards, campaign queues, verified-review replies, shift planning, and payroll inputs
- Dashboard trends, service buffers, split-payment checkout UI, CSV exports, and workspace audit history
- Unified marketplace, website, phone, walk-in, and staff-created booking origins
- Day/week booking calendar with branch, professional, status, and origin filters
- Appointment creation, automatic qualified-staff assignment, conflict checks, status transitions, leave checks, and status history
- Tenant service catalogue with branch-specific price, duration, tax, activation, and staff assignments
- Owner/manager team account creation with primary and additional branch assignments
- Transactional GST checkout with invoice lines, offline split-payment records, stock deduction, commission, loyalty, and appointment completion
- Branch financial-year invoice sequencing
- Super Admin verification, subscription assignment, access control, marketplace publishing, and audit logs
- Tenant and role authorization derived from signed server sessions
- Installable PWA shell

Message delivery requires provider credentials. Online payment processing, statutory payroll filing, and the salon website builder remain separate milestones.

## Local access

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- Marketplace: `http://localhost:3000`
- Salon workspace: `http://localhost:3000/workspace/home`
- Salon registration: `http://localhost:3000/onboarding/register`
- Salon onboarding: `http://localhost:3000/onboarding`
- Super Admin: `http://localhost:3000/admin`

Pilot credentials:

- Salon owner: `owner@operyx.demo` / `Aero@1406`
- Seeded stylist: `meera@operyx.demo` / `Aero@1406`
- Super Admin: `admin@operyx.demo` / `Aero@1406`
- Customer development OTP: `123456` (development only — disabled in production)

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Deployment notes

- Payments are recorded offline; Operyx does not process money.
- Local development uploads are stored under `.data/uploads`.
- Set `STORAGE_PROVIDER=s3`, `S3_BUCKET`, `S3_REGION`, and optional `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE=true` for S3-compatible production storage.
- Customer OTP and messaging remain development-only until providers are configured.
- Operyx domain and trademark checks should be completed before public launch.
