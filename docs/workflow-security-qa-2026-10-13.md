# Workflow security QA: 2026-10-13

## Scope

This draft contains only workflow database migrations and focused regression tests, based on main `f819f7745bafbb2e7793e84e84f060bfb79adc15`. It does not include PR #37, #38 or #39. Runtime integration tests used those changes in an isolated local combined tree; no remote merge or production schema change was performed.

All accounts, support knowledge, inventory and orders were explicitly synthetic. Order eligibility for return tests used direct synthetic paid/delivered fixtures; no payment, refund, delivery or accounting settlement was executed or verified.

## Confirmed defects and narrow fixes

- An eligible buyer could insert a return claim with `status='approved'`; real API response and database readback both retained that value. The customer INSERT policy now requires `submitted` while retaining the existing buyer/order/item and delivered/paid conditions. Customer UPDATE permission is not added.
- An authorized rules editor could save future selling-rule versions missing `sellerBps` or `minimumPickupEstimatedValueCents`. Required numeric/type/null checks now reject those inputs before inserting a version or audit record. Existing versions, commission locks and historical snapshots are not rewritten.
- Customer support handoff and follow-up RPCs failed because a legacy audit trigger imposed staff-only authorization even after an ownership-checked RPC authorized the update. The audit-only migration now records already-authorized writes without widening grants or changing RPC ownership checks. The subsequent transition migration restricts direct writes as described below.
- Disabled support membership did not override retained AI capability flags in direct APIs. Inactive membership now denies both the permission helper and trainer context, retaining independent AI capabilities for users without support membership and the existing configurable MFA policy.
- Limited staff could bypass assignment/close checks using raw conversation UPDATE, and SQL NULL comparison let an unassigned thread pass the return-to-AI check. Raw authenticated UPDATE grants are removed (including legacy column grants); checked workflow RPCs and service-role writes remain available. The assignment check now uses `IS DISTINCT FROM`.
- Pickup-capable logistics staff could manage a pickup through checked RPCs but not read it because the SELECT policy named a nonexistent legacy role. A narrow role-plus-capability branch now permits that read with the existing MFA requirement, preserving existing readers and granting no item-edit permission.
- Support detail/inbox returned Auth `varchar` email into declared `text` columns, producing a real PostgREST function-result mismatch. Explicit email casts fix those result contracts.

## Verification layers

The focused database tests use PGlite and explicitly stubbed Auth helpers. They test SQL invariants, not actual sign-in or MFA. Native integration tests use real local GoTrue password/TOTP sessions and PostgREST against real Supabase system schemas, plus fixture-only SQL setup/readback/cleanup.

Operations integration after the fix: 209 passed, zero failed. The tests include buyer status-forgery attempts, cross-user/order/eligibility guards, settings boundaries/versioning and normal inventory/logistics operations. Settings and synthetic fixture state were restored.

Standalone main-based source suite: 89 passed. TypeScript and lint passed (two existing lint warnings). The standalone app was not started against main's hardcoded production configuration. Production builds and HTTP integration are verified separately in the safely isolated combined tree.

Final support/role integration: 324 passed, zero failed or blocked. Both this report and the strict operations report identify local-only combined commit `172c022eb06e8aabc71c967e7900252e8c8f435d`, tree `ad663c61f9e6c753f8b9907f9e13f3fcfa1ba1a1`. The special case of an authenticated-anonymous principal already owning a support thread remains unverified; no fabricated anonymous JWT claims were used. Browser execution remains blocked by this executor's socket capability; HTTP/API checks do not establish browser interactions. External model, payment, carrier and real-world actions remain unverified.
