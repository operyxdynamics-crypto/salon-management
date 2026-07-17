# Operyx Development Audit - 13 July 2026

## Validation Status

- TypeScript: passed with `npm run typecheck`
- Tests: passed with `npm test` - 2 files, 8 tests
- Prisma schema: passed with `npx prisma validate`
- Production build: passed with `npm run build`
- Browser console on dashboard: no captured errors or warnings
- Desktop/mobile layout audit: no horizontal overflow detected in the in-app browser

## Refinements Completed In This Pass

- Added SaaS package visibility to the salon workspace Settings screen.
- Exposed current plan usage for branches, staff, services, monthly appointments, and storage.
- Added disabled owner actions for pending future workflows:
  - Request new brand
  - Request package upgrade
- Added final UI stabilization CSS for:
  - smoother hover/active states
  - clearer selected sidebar state
  - compact 14-inch/laptop density
  - safer fixed-height sidebar scrolling
  - better focus rings for keyboard use
  - smoother modal/popover entrance animation
- Replaced a corrupted UI arrow string with clean ASCII text.
- Replaced the Mac-only search hint with `Ctrl K` for this Windows laptop environment.

## Current Module Coverage

### Salon Workspace

- Home: database-backed daily dashboard, KPIs, queue, alerts, recent invoices, team/stock widgets.
- Bookings: list/calendar foundation, appointment creation, details, status actions, appointment-to-billing handoff, blocked-time foundation.
- Customers: CRM list/profile foundation, history, invoices, loyalty, wallet, benefits, notes, allergies, tags, consent.
- Billing: POS checkout, linked appointment checkout, GST/non-GST invoices, split offline payments, invoice auto-open, held sale foundation.
- Invoices: searchable invoice center, detail drawer, print/save-as-PDF browser flow, refund/void/partial return foundation.
- Day Close: register open/close, expected cash, counted cash, variance, sales/refund/payment/GST summary.
- Services & Prices: categories, service master, branch overrides, card/list UI foundation.
- Stock: products, vendors, purchases, transfers, stocktakes, recipes, low-stock tracking.
- Team: staff, branch assignments, attendance, shifts, leave, commissions, payroll summary/export foundation.
- Offers: memberships, packages, gift cards, wallet, reward rules, redemption foundations.
- Marketing: setup-required state; real provider sending remains disabled.
- Reviews: review inbox foundation.
- Reports: monthly sales/GST/expenses/inventory/staff/benefit reporting foundation.
- Settings: booking page sharing, business info, audit logs, SaaS package usage.

### Super Admin

- Tenant creation and approval are present.
- Branch review/publication, document review, plan assignment, notes, suspension/reactivation, and audit logs are present.
- Subscription plan records and tenant subscriptions exist.

## Important Remaining Gap

Owner-initiated new brand onboarding is not complete yet.

The existing system lets Super Admin create and manage tenants/plans, but the salon owner cannot yet request a new brand from the salon workspace. That workflow needs a dedicated milestone because it affects data model, approval states, plan limits, notifications, and Super Admin review.

Recommended model/API additions:

- `BrandOnboardingRequest`
- requested brand name, owner tenant, optional main branch link, notes, status
- Super Admin decision fields: reviewer, review note, rejection reason, approved tenant/branch link
- plan-limit check at request and approval time
- audit events for request, correction, approval, rejection, upgrade recommendation

Recommended UI additions:

- Owner Settings: `Request new brand`
- Owner Settings: package usage and remaining limits
- Owner Settings: upgrade request
- Super Admin: brand request inbox
- Super Admin: approve as new tenant or link to existing tenant/branch group

## Recommended Next Development Order

1. Finish owner package visibility and brand request workflow.
2. Add Super Admin brand request inbox and approval/rejection actions.
3. Add plan-limit enforcement for brand/branch/staff/service/appointment usage in the visible UI.
4. Continue module-by-module UX QA: Bookings, Billing, Customers, Invoices, Stock, Team, Reports.
5. Run browser journeys for owner, receptionist, accountant, stylist, and Super Admin.

## Browser Layout Notes

- Desktop and mobile checks did not show horizontal scrolling.
- Sidebar now has safer scroll behavior for shorter laptop screens.
- The in-app browser viewport tool reports scaled CSS dimensions, so visual QA should still be repeated manually on the actual 100% laptop display before launch.

