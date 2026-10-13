# Seller lifecycle: local regression evidence (2026-10-13)

## Scope and safety

This PR is a reviewable code proposal. No migration was applied to a hosted database, no real pickup/item/inspection was created, no email or photo was sent, and no payment behavior was enabled. Preview and production were reported to share the same Supabase project; a preview URL alone is not an isolated test environment.

`tests/seller-lifecycle-db.test.ts` runs entirely in an in-memory PGlite database. It executes selected repository SQL function bodies against minimal synthetic tables, with synthetic JWT identities and roles. This is not a full migration replay, RLS audit, browser E2E test, physical-inspection verification, or evidence that production is configured correctly. Seller confirmation is supplied as a fixture; actual confirmation/OTP delivery and slot reservation are not exercised. Pickup status `inspection` represents intake in this fixture; warehouse receipt, location and physical custody still need real authorized operations.

## Verified defect and proposal

The existing `admin_publish_item` RPC accepts any positive shop price. Its commission guard protects the initially approved price, but not the live selling-price floor. A synthetic item with an approved CAD8 price and recorded inspection could therefore publish for CAD0.01.

The new migration enforces the active `minimumSellingPriceCents` for non-Home listed/relisted inventory and extends the existing inspection trigger to changes to inspection, category and listed price. The admin publish form and server action use the same active floor. The migration does not rewrite existing records. Home's separate workflow is unchanged. Below-minimum intake override records remain possible under existing permissions, but publication still requires the current selling floor.

## Local coverage

- CAD59.99 Bag rejected, CAD60 accepted by existing configured-minimum/pricing triggers.
- Nonstaff and AAL1 staff denied privileged pickup/intake actions.
- Seller confirmation required before collection; confirmed synthetic pickup advances to scheduled, collected and inspection.
- CAD7.99 normal intake rejected; manual review and rejection evidence workflow exercised.
- Rejected item cannot be attested; missing evidence rejected.
- Stranger, stale-price and duplicate seller approvals rejected.
- Missing seller approval, photos and physical-inspection record prevent publication.
- Only AAL2 staff can attest; repeated attestation creates one audit record.
- Current CAD0.01 publication defect reproduced before the proposed migration.
- After migration, CAD7.99/null listed prices and below-floor relisting rejected, CAD8 publication succeeds.
- Active configured floor change honored; clearing inspection on live inventory rejected.
- Seller-approved initial price and commission remain locked.
- UI regressions cover accessible Account label, clothing metadata, unpaid order-preparation steps and flat pickup-fee copy.

## Remaining release gates

1. Obtain approval for a genuinely isolated Supabase environment; explicitly configure its URL and publishable key and enable the isolation guard described in the [test-isolation guide](isolated-supabase-testing.md).
2. Apply/replay migrations there and test full RLS/grants, authenticated seller/staff browser paths, AAL1/AAL2, retries/concurrent edits, OTP/email, pickup slots, real upload behavior, warehouse receipt and rejection/approval flows.
3. Have an accountable human physically inspect real clothing before any real listing; synthetic attestations are not operational evidence.
4. Review this migration and apply it to the intended production project only with separate authorization. A merged frontend alone would leave direct RPC publication vulnerable until the database change is applied.
5. Payment activation remains a separate final readiness stage.
