# REWEAR Market

Managed secondhand marketplace starting in Montréal, with Canada-wide shipping infrastructure. REWEAR receives and inspects items, prepares listings, manages orders and coordinates fulfillment. It is not a peer-to-peer marketplace.

## Application

- Next.js 16 / React 19, TypeScript, Supabase and Vercel.
- Node.js >=22.13.0 and <23; use Node 22 locally and in Vercel.
- Public storefront: https://lresale.vercel.app
- Install locked dependencies with `npm ci`; start locally with `npm run dev`.
- Validate with `npm test`: database/security regressions, ESLint and production build. Local PGlite tests do not apply or verify production migrations.
- `npm run generate:admin-salt` creates the local admin rate-limit salt before development/build/lint. Never commit credentials or expose server secrets through NEXT_PUBLIC_ variables.

## Operating rules

- Individual listing minimum: $8 CAD. Estimated combined collection/Bag minimum: $60 CAD.
- Items must be clean, intact and accepted after accountable physical inspection.
- New listings require recorded item inspection; legacy listed inventory requires separate review.
- Seller pricing review and commission follow the active server rules.
- Prepared orders are not paid sales. Live payment integration is the final readiness stage, with verified signed webhooks and reconciliation.

See [pre-payment operations](docs/prepayment-operations.md) for migration/configuration checks, cron setup, reservations, orders, inspection and remaining launch gates. Supporting guides cover [customer administration](docs/customer-admin-workflow.md), [shipping](docs/postal-shipping.md) and [home decor](docs/home-decor.md).

## Deployment and verification

Vercel automatic deployment is enabled for main in vercel.json. Other branches do not automatically deploy. Verify the intended deployment and exact Supabase project before any production action. Apply required migrations to the intended environment and verify their actual behavior; a successful build does not prove email, carrier quoting, authentication or database configuration works.

## Sushi operator

Sushi is scoped exclusively to this repository. Its persisted owner request, runbook, tasks, reports and readiness matrix live on the separate **sushi/operations** branch under sushi/. Fetch that branch to read operational memory; never merge it into the application.

Hosted hourly and GitHub PR-triggered iterations and daily/weekly reports are configured. Configuration is not evidence of a completed execution. A dedicated continuously running executor and immediate deployment/CI/payment/order/job failure triggers remain commissioning work. See that branch's current state for verified completion and blockers.
