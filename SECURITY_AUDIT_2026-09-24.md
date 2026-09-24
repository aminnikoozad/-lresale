# REWEAR security hardening — 2026-09-24

This change set addresses confirmed and low-risk findings from the production security/bug audit.

## Fixed

- Removed the demo account route so sample account data cannot be served by production.
- Added a CSP directive that blocks inline JavaScript event-handler attributes (`script-src-attr 'none'`) while retaining the current Next.js-compatible script policy.
- Added indexes for two previously unindexed foreign-key paths:
  - `pilot_cost_entries(created_by)`
  - `return_requests(order_item_id, order_id)`
- Rewrote four RLS policies to use statement-level init plans for fixed auth/admin checks.
- Consolidated overlapping `home_subcategories` read policies without changing visibility semantics.
- Added regression tests for the removed demo route and CSP directive.

## Intentionally unchanged

- RLS-enabled service-only tables with no policies remain deny-by-default for browser roles.
- Public and authenticated `SECURITY DEFINER` RPCs were not blindly revoked because several are intentional application API endpoints and/or contain internal authorization checks. They require function-by-function redesign before moving to a private schema or switching to `SECURITY INVOKER`.
- Existing unused-index notices were not acted on because a young/low-traffic database can legitimately show zero usage; removal without workload evidence could regress performance.
- Full removal of `unsafe-inline` from `script-src` was not attempted in this patch because Next.js nonce/hash CSP requires a rendering strategy change and must be validated separately to avoid breaking hydration/static routes.

## Verification

After applying the database migrations, Supabase performance advisors no longer reported the two unindexed foreign keys, the four auth RLS init-plan findings, or the overlapping permissive policy finding.
