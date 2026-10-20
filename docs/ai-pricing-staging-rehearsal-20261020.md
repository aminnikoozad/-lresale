# Pricing staging rehearsal — 20 October 2026

Status: **offline production-catalog SQL rehearsal passed; hosted staging and browser acceptance remain blocked**.
The Supabase connector returned `Branching is supported only on the Pro plan or above`. No upgrade, paid resource, preview branch, production migration, merge or production deployment was performed.

## Production protection

Only read-only queries were run against `lsdhobwrnmlkqnvkamlt`. A catalog snapshot was reconstructed into an isolated PGlite database. Customer rows, Auth accounts, stored objects, passwords and API credentials were not copied. Only the existing versioned selling-rule configuration was seeded; all users, Bags, items, addresses and orders used in the flow were synthetic and local.

| Check | Before | After |
|---|---|---|
| Items / orders / Bags | 0 / 0 / 0 | 0 / 0 / 0 |
| Production migration history | 117 | 117 |
| Public/private function fingerprint | `586bfeb38771dfcd93c7fdb9530241e2` | identical |
| Versioned business-rule fingerprint | `0eee3b8f7966fb708b33e7c8454e3248` | identical |
| Production `private.pricing_analyses` | absent | absent |
| Hosted branches | existing main only | existing main only |

All 96 pre-existing SQL files on the feature branch are byte-for-byte unchanged (the 95 main-branch SQL files plus the existing pricing-foundation migration). The payment correction is a **new forward-only migration**. These fingerprints are validation evidence, not a production data backup or recovery plan.

## Real catalog used for the offline rehearsal

| Catalog objects reconstructed | Count |
|---|---:|
| Tables in public/private/auth/storage | 131 |
| SQL / PL/pgSQL functions | 253 |
| Constraints | 673 |
| Triggers | 65 |
| RLS policies | 89 |
| Indexes | 221 |

The metadata export is read-only (`scripts/pricing-schema-snapshot.sql`). The full snapshot is kept under ignored `work/pricing-staging/`; it is not published in GitHub. Snapshot SHA-256: `9282806d2f492f98c441cb6d14e159ea1126ca7955aafae3fac0f647b6ea3f9f`.

The loader uses the real function definitions, generated columns, constraints, trigger order and RLS policies, rather than replacing the application's guards with permissive test stubs. `pg_trgm` is loaded locally for the actual search indexes. This is a catalog-based PostgreSQL rehearsal, not a clone of hosted Auth, PostgREST, cron, Storage, Edge Functions or infrastructure configuration.

## Flow verified locally

1. Create synthetic Auth rows and let the actual profile trigger create profiles.
2. Accept the existing seller team-pricing mandate.
3. Reject a Bag below CAD 60; accept a qualifying Bag through the seller's RLS permissions.
4. Confirm pickup as the seller; record collection and inspection through the actual admin RPCs.
5. Create the item through `admin_create_item_v5`.
6. Apply the pricing-foundation migration and compare the complete existing item row and selling rules before/after. Neither changes, apart from the new null approval column.
7. Reject publication without approval and reject incomplete inspection checks. Record physical-inspection attestation and clothing photo roles through the actual RPCs.
8. Record a reasoned manual admin price approval and publish at the exact approved price.
9. Verify seller-safe price/share visibility, denied raw price access and cross-seller isolation.
10. Claim and complete a pricing analysis through the service-only leased worker RPCs.
11. Prepare checkout through the real checkout/terms functions and reject concurrent repricing during reservation.
12. Reproduce the existing generated-column payment error, apply the new compatibility migration locally, then successfully apply the synthetic verified-payment event twice without duplicate seller credit.
13. Verify the sold item's immutable price and order snapshot, then refund the order and verify reversal of pending seller credit.

Result: all eleven recorded flow checks passed. No external API calls, real payments, messages or bank payouts were made. JWT claims and MFA level are explicitly simulated in this SQL rehearsal; this does **not** prove real Auth login or MFA verification.

## Payment incompatibility found and corrected

The actual `public.items` table has stored generated columns for final seller/platform earnings. The existing paid-order trigger attempted to assign them explicitly, causing PostgreSQL to reject payment application.

New migration: `20261020185852_pricing_payment_generated_earnings_compatibility.sql`.

It changes only `private.sync_paid_order_seller_wallets()` to set sale status and sold price while PostgreSQL computes the generated fields. Existing commission checks, reservation conversion, wallet-credit idempotency and refund reversal remain intact. No table, generated expression, order line, historical price or wallet row is rewritten.

The migration aborts atomically if the current function fingerprint differs from the audited implementation or if the expected generated-column schema is missing. A newer payment implementation must be reviewed, never overwritten silently.

The legacy generated platform-earnings column is a gross projection. Platform revenue after coupons is derived from the existing order line and seller-credit ledger (as in the new pricing-performance view). The fixture and assertion were updated to match that actual schema; the expected net-revenue amount remains unchanged.

## Preview isolation

Unconfigured Vercel previews now fail before a Supabase client can be created. A preview must explicitly supply both public URL and publishable key for a separate test project; the known production project URL is rejected even with a trailing slash. HTTPS is required. Existing production defaults remain unchanged for production deployments.

This intentionally prevents a preview from silently using production while hosted staging is unavailable. It may cause the PR preview build to fail until the correct test-project environment variables are configured; that is expected isolation, not a reason to weaken the guard.

## Automated validation

- The pricing/payment regression group passed 21 tests, including real generated earnings columns and three new migration compatibility/preservation tests.
- Two additional preview-isolation tests passed.
- The complete pricing group passed 17 tests after the final changes.
- Next.js production build and TypeScript passed; ESLint has no errors and the same existing image warning.
- The complete repository suite ran 170 tests: 163 passed and the same seven independently confirmed pre-existing UI assertion/mock failures remained. No new failure was introduced; the seven failures remain release gates.

Reproduction (Node 22, dependencies from the existing lockfile):

```bash
npm run test:pricing
npm run test:pricing:catalog -- work/pricing-staging/schema.json
npm run test:pricing:flow -- work/pricing-staging/schema.json
npm run lint
npm run build
```

The catalog/flow commands require a privately obtained metadata snapshot and have no DSN, API-key or network-connection parameter. They never target a hosted database. The snapshot is deliberately not committed to the repository.

## Remaining hosted acceptance gate

A separate hosted Supabase test project or supported development branch is still needed. Configure its own URL, keys and MFA-enabled admin account, apply the reviewed migrations there, and run the actual browser Bag → Intake → Inspection → Pricing → Approval → Listing → Sandbox Sale → Settlement/Payout scenarios. The production payment adapter is not activated by this work.

Real image recognition, licensed automated market connectors, calibrated cost/season/demand factors, actual cost capture and the bundle pricing engine remain outside this foundation. Do not merge PR #62 or apply either pricing migration to production until the hosted acceptance gates and the existing UI test failures are resolved.
