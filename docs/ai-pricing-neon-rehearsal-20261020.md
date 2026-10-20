# Pricing SQL acceptance on Neon — 20 October 2026

Status: **the production-catalog SQL flow passed on hosted PostgreSQL 17.11 in an isolated Neon branch**. Browser acceptance, real Supabase Auth/MFA, provider sandbox payment and bank payout remain unverified. This is not approval to release to production.

## Test destination

| Setting | Value |
|---|---|
| Existing project | `rewear-test` / `patient-unit-40841126` |
| New isolated child branch | `shikimomo-pricing-qa-20261020` / `br-rapid-salad-b4gf1r6h` |
| Parent, unchanged | `test-only` / `br-aged-morning-b4n6gzjp` |
| New empty test database | `shikimomo_pricing_qa` |
| Compute bounds | 0.25–0.25 CU |
| Branch automatic expiry | 23 October 2026, 19:15 UTC |

The first branch request was rejected because this account does not permit changing the suspend interval. No branch existed after that rejection. Creation succeeded with the account's default suspend setting. No plan upgrade was requested; actual infrastructure billing was not measured.

The child inherited the existing test project's branch state. The pricing rehearsal itself used a **new empty database**, not the inherited `rewear_test` database. No Supabase customer rows, user records, storage objects or API keys were imported. Existing versioned selling rules were seeded; all flow identities, photos, addresses, Bags, items and payment events were synthetic.

## Schema and execution method

The same offline catalog used in the local rehearsal was restored: 131 tables, 253 SQL/PLpgSQL functions, 673 constraints, 65 triggers, 89 RLS policies and 221 indexes. Snapshot SHA-256: `9282806d2f492f98c441cb6d14e159ea1126ca7955aafae3fac0f647b6ea3f9f`.

The restore ran as 19 transactional batches, with the actual function definitions, generated-column expressions, constraints, triggers and policies. No historical repository migration was edited. The two pricing migrations were executed from their existing files, including the payment correction's fingerprint/schema drift guard.

The existing `scripts/pricing-flow-rehearsal.ts` assertions were executed using a temporary test-only file bridge instead of its PGlite adapter. Only import/migration paths and the database transport were substituted in the temporary runner. The connected Neon SQL executor received 54 flow requests; each request used a transaction with explicit test JWT settings and, where applicable, `SET LOCAL ROLE`. Function bodies and application assertions were not replaced. Temporary bridge files and catalog batches remain under ignored `work/pricing-neon/`; no production connection strings or application environment files were changed.

Neon is not an exact Supabase infrastructure clone. The imported roles are non-login test roles; notably, `service_role` does not have Supabase's `BYPASSRLS` attribute. Owner-executed setup and existing security-definer RPCs were used as described above. Owner/ACL infrastructure, hosted Auth, Storage, PostgREST and cron behavior require separate acceptance tests.

## Results

All eleven recorded flow checks passed:

1. Reject a Bag valued below CAD 60; accept CAD 60 through seller permissions.
2. Apply the foundation migration without changing the existing synthetic item row or selling rules, except for the new null approval column.
3. Record inspection and clothing-photo evidence; reject incomplete inspection and unapproved publication.
4. Approve a manual price with a reason and publish at exactly CAD 20.
5. Show the seller CAD 20 and CAD 9 estimated earnings, while denying raw internal pricing access and cross-seller access.
6. Claim and complete one analysis through service-only worker functions.
7. Reserve checkout and block concurrent price changes.
8. Reproduce the original payment trigger's generated-column error on hosted PostgreSQL.
9. Apply the forward-only compatibility migration and accept the synthetic verified-payment event twice without duplicate credit.
10. Keep the paid order snapshot unchanged and create exactly one CAD 9 seller credit.
11. Refund the synthetic order and reverse the pending seller credit. No bank payout was initiated.

Post-run database verification found one approval, one publication, one completed analysis, one seller credit and one reversed credit. No payment gateway, recognition provider, external market source, email or SMS service was called. The payment event was an SQL fixture, not a gateway sandbox transaction.

## Isolation verification

The parent Neon database still has 88 public tables, no `private.pricing_analyses`, and no `shikimomo_pricing_qa` database. Its default branch was not changed.

A final **read-only** Supabase production check confirmed zero items/orders/Bags, the same 117 migration-history entries, no `private.pricing_analyses`, and the original payment function fingerprint `fbcd92ba2929eb3e672a9c9f468ff0bc`. Neither pricing migration has been applied to production.

Application source files, existing SQL files, production environment variables and deployment targets were unchanged during this Neon test. Previous automated suite/build results are recorded in [the local rehearsal report](ai-pricing-staging-rehearsal-20261020.md); they were not rerun for this documentation-only update. The seven existing UI test failures remain unresolved.

## Remaining acceptance

Neon has completed the hosted PostgreSQL portion of testing. An isolated Supabase-compatible web staging environment is still needed for actual admin login/MFA, HTTP/PostgREST authorization, photo uploads, browser Bag-to-sale flows, payment-provider sandbox callbacks and settlement/payout. Simulated JWT claims do not prove real authentication or MFA enforcement. Production preview guards remain intact; the application was not pointed at the Neon SQL endpoint as though it were a Supabase URL.

No production migration, merge, release or paid plan upgrade was performed.
