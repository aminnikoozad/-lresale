# Shikimomo pricing foundation — review handoff

Status: **implemented locally, draft for staging; not deployed to production**.
Base audited: `d6401cc041f556481bf56df1b66f5cad1d80d726` (20 October 2026).
This is an individual-item pricing foundation, not a completed three-phase AI system.

The subsequent [production-catalog rehearsal report](ai-pricing-staging-rehearsal-20261020.md) records the safe offline flow, a payment compatibility correction, preview isolation and the hosted-staging blocker.

## What is implemented

- Admin queue at `/admin/pricing`, 50 rows per keyset page; per-item workspace at `/admin/items/{id}/pricing`, linked from the existing item manager.
- Manual authorized Canadian CAD market evidence, explicit listed/sold classification, observation dates, source links, operator-assessed similarity and evidence notes. Invalidations retain original records.
- A deterministic sold-median engine, interquartile evidence range, reason codes and exclusion reasons. It checks freshness, brand, category, inspected condition, similarity, duplicates and malformed evidence. Listed prices never drive a completed-sale recommendation. No price is suggested without configured eligibility rules and enough sold evidence.
- Economics use the existing selling-rule commission tiers for the initial decision and the item's immutable commission after that decision. Profit stays unknown until costs and the minimum-profit target are entered. No assumed seasonal/demand multipliers or invented costs.
- Owner/admin + MFA final approval, a required reason, physical inspection, photos and existing seller team-pricing mandate. Staff can prepare evidence and request analysis. Only an exact approved price can be published. Manual approval works without an AI provider or background worker.
- Database enforcement covers legacy item finalization/publication paths. Exact item/evidence snapshots and current-price checks reject stale decisions. An active checkout or sold item cannot be repriced. Changes to priced attributes or clothing evidence require withdrawal from the live listing and another review. Existing initial commission locks remain immutable.
- Append-only approvals, completed analyses and publication snapshots, plus the existing audit log. New internal tables have RLS enabled and no direct user or worker grants.
- A seller-safe RPC replaces raw item reads. Provisional prices, operating costs, competitor data and analysis results are not included. Existing seller timelines retain their safe projection.
- Background jobs with a daily input cache that also expires when evidence crosses the freshness boundary, at most 10 new requests per item per 24 hours, SKIP LOCKED leases, three attempts, backoff and stale-worker rejection. The worker is a server-only endpoint, not automatically scheduled by this change.
- Configurable unsold review days create review tasks only. The existing hourly operations job no longer automatically publishes items or applies markdowns. Its existing selling-period expiry and disposition behavior is preserved.
- Online order outcomes are read from the existing order/credit ledger. Initial publication price is recorded for future publications. No second settlement ledger or payout mechanism is introduced.
- Typed recognition-provider interface and strict suggestion validator. Recognition cannot write an inspected condition or price through that interface.

## Files and schema

| Area | Files |
|---|---|
| Deterministic calculations, provider contract, worker | `lib/pricing/engine.ts`, `recognition.ts`, `server.ts` |
| Admin item workspace | `app/admin/items/[id]/pricing/{page.tsx,price-form.tsx,actions.ts,pricing.css}` |
| Queue | `app/admin/pricing/page.tsx` |
| Worker endpoint | `app/api/cron/pricing/route.ts` |
| Existing integration | `app/admin/items/page.tsx`, `app/account/seller/page.tsx` |
| Staging configuration | `lib/supabase/config.ts`, `next.config.ts` |
| Additive, transactional migration | `supabase/migrations/20261020182321_ai_pricing_foundation.sql` |
| Tests | `tests/pricing-engine.test.ts`, `tests/pricing-db.test.ts`, `tests/fixtures/pricing-db.ts`, `package.json` |

New private tables: `market_comparables`, `pricing_analyses` (also the job queue), `pricing_approvals`, `pricing_reviews`, `pricing_publications`.
New private view: `pricing_performance`, derived from online orders and existing seller credits.
New item column: `public.items.pricing_approval_id`.
A second forward-only migration, `20261020185852_pricing_payment_generated_earnings_compatibility.sql`, fixes the existing payment trigger's writes to generated earnings columns, with schema/function drift checks. No historical SQL migration is edited.
Versioned pricing rules reuse `public.business_setting_versions`, key `ai_pricing_rules`.
Approval and publication records serve as pricing history; no duplicate generic history table is created.

The migration does not delete records, fabricate past approvals, backfill historical prices, change selling-rule commission tiers, change the CAD 8 item floor, or change the CAD 60 Bag minimum. Raw item SELECT is restricted to `id` for existing admin counts; seller financial reads move to `my_priced_items()`. Deploy the matching app and migration together in a maintenance window after staging validation.

## Connections and cost

**External market sources connected: none.** eBay, Poshmark and Lululemon are not scraped or presented as connected. V1 accepts manually supplied authorized evidence. The online-sale outcome view is connected to Shikimomo's existing tables, but automatic conversion of those outcomes into market comparables/statistical models is not implemented.

**External API cost of the implemented rules-only analysis: CAD 0.** This excludes existing hosting/database costs. No paid AI request is made. Image-recognition cost cannot be estimated honestly until the provider, model, image policy and budget are selected. Job API-cost fields currently record zero for this rules engine; usage/billing for a future recognition adapter still needs implementation.

## Configuration needed from the owner

1. A safe Supabase staging project/branch and a staging owner/admin account with MFA. Production was inspected read-only; no migration was applied there.
2. Actual per-item processing cost, expected storage cost, allocated fixed/percentage payment fees and minimum platform profit. The Bag service fee is **not** treated as an actual per-item processing cost. Confirm how order-level fixed fees are allocated.
3. Verified market evidence to set freshness, minimum sample count and similarity thresholds. These remain null until deliberately configured. All price and cost amounts are CAD cents; rates use basis points (10000 = 100%).
4. The desired recognition provider/model or local server, approved budget per item/month and secure server-side credentials. Do not put API secrets in chat or `NEXT_PUBLIC_*` variables.
5. Licensed market-source access, if available, with permitted fields/usage. Manual evidence can be used meanwhile.
6. Unsold review intervals and the commercial policy for future markdown suggestions. Review days default to an empty schedule; no discount percentages are invented.

Existing team-pricing terms and commission rules are reused. Any change to those terms remains a separate business decision. Production release still requires owner approval after staging acceptance.

## Safe staging runbook

1. Use Node 22 (`>=22.13 <23`) and run `npm ci`.
2. Set **both** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to staging before building. CSP/image origins follow that URL. The legacy production defaults remain for existing production deployment. Vercel previews now fail closed if staging credentials are absent or the known production URL is supplied.
3. For the worker only, set staging `SUPABASE_URL` and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` through the host's secret manager. The worker rejects a mismatched project URL. Configure a random `CRON_SECRET` of at least 32 characters.
4. Verify the target project explicitly. Apply all required existing migrations and the new migration in staging. The new file is transactional. Do not apply it to production merely to preview the UI.
5. Run `npm run test:pricing`, `npm run lint`, `npm run build`. The complete suite also has known baseline failures listed below; these are release-gate follow-ups, not suppressed tests.
6. Schedule an authenticated GET to `/api/cron/pricing` with `Authorization: Bearer <CRON_SECRET>` on the staging scheduler. Each invocation claims up to 10 jobs, one lease per worker. Unconfigured/unauthorized calls return 503/401. No external recognition API is invoked.
7. Existing `rewear-ops-automation` continues to create unsold-review tasks and process the existing expiry rules. Check its schedule in staging. Do not enable the old auto-publish/markdown behavior elsewhere.
8. In the real staging UI: create a Bag, receive an item, record physical inspection and required clothing photos, accept the seller mandate, add licensed evidence, configure rules, request analysis, run the worker, approve with MFA and publish. Attempt publication before approval and a stale approval after editing evidence. Verify the seller sees only the approved price/share.
9. Complete a gateway sandbox checkout, attempted concurrent repricing, cancellation, refund, settlement and payout checks. This change does not enable the disabled production payment adapter. A pending wallet credit is not a completed bank payout.
10. Review the draft and approve a coordinated production rollout only after the staging gates pass. If rollout fails, keep affected listings unpublished and deploy a forward fix; do not drop history tables or weaken the publication guard to restore an older UI.

## Validation performed locally

- **12 new automated tests passed**, using Node 22 and PGlite with actual existing pricing, catalog, checkout, payment and wallet SQL plus the new migration.
- Coverage: sold/listed separation; stale/invalid/mismatched evidence; insufficient market data; missing costs; CAD 8 floor; commission boundaries/rounding/lock; malformed recognition output; no automatic recognition authority; MFA and role checks; seller privacy; immutable history; stale approvals; no automatic publication; cache, leases, retry limit, request cap; evidence corrections; manual approval; unsold review idempotency; exact approved publication; real local verified-payment function, seller credit and refund; paid-order price preservation.
- Scale checks: 2,000 independent engine analyses of 500 comparables each; database queue paging with 2,500 additional items. These are bounded local checks, not a production throughput/SLA benchmark.
- Production HTTP smoke checks passed: anonymous `/admin/pricing` redirects to secure admin login (307); an unauthorized worker request returns 401.
- TypeScript and production Next.js build passed. ESLint passed with one pre-existing image warning in `app/account/seller/items/page.tsx`.
- The full existing security suite ran: **165 tests, 158 passed, 7 failed**. All seven failures were reproduced on an untouched worktree at the audited base commit. They are stale UI assertions/mocks in `account-workspaces` (2), `buyer-flow-navigation` (1), `site-language` (1), `storefront-theme` (1), `support-page` (2). They have not been hidden, skipped or rewritten to make this change green.

**Not yet verified:** applying this migration to a complete staging Supabase instance; authenticated browser end-to-end Bag → Inspection → Pricing → Approval → Listing → Sale → Payout; real gateway sandbox settlement; production cron; visual/accessibility and full French copy review. Local SQL integration tests do not substitute for these gates.

## Explicit remaining work

- Real image recognition adapter, provider usage/cost accounting and operator correction UI for model suggestions. Only the interface/validator is present.
- Authorized automated market connectors; internal sold-data matching with cancellations/returns exclusion; calibrated confidence and demand/season/size/time-to-sale estimates.
- Actual processing/holding/payment cost capture, offline-sale outcome coverage, settlement/payout outcomes, brand/category optimization reports and statistical learning.
- Discount **amount** recommendations. The implemented schedule creates review tasks; an admin chooses the price manually using current evidence.
- Bundle-specific analysis and approval-history integration. The existing bundle workflow is preserved, outside the new individual-item engine, and must be included in staging compatibility review before claiming site-wide pricing coverage.
- Approval history pagination beyond the latest 50 decisions, configurable per-item request budgets beyond the conservative hard limit, and an explicit exhausted-job retry action. A failed request can be retried by the worker up to three times; a new unchanged request on the same UTC day reuses its existing job.
- Resolve the seven independently confirmed baseline UI test failures and complete the release gates above.

## Publication status

The feature branch is `codex/ai-pricing-foundation`. The owner explicitly authorized publishing this branch to the public GitHub repository on 20 October 2026 after reviewing the scope. Publication is for draft code review; production migration, merge and release remain separate staging-gated steps. No production database changes or deployment have been performed.
