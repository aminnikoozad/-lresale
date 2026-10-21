# Seller rules acceptance and photo correction

Review/staging only. This does not activate marketplace payments, publication, transfers, payouts, return labels or legal arbitration. Production is untouched.

## Actual change

Direct sellers no longer need four angles. At least one clear actual-item photo is required. Additional views are optional. Brand/size label or an explicit absent-label declaration remains supported. A declared defect requires a processed, owner-controlled clear photo with its own specific explanation and overall condition disclosure. A seller cannot assert no known flaws while retaining defect records or conflicting condition notes. Photos do not establish authenticity or guarantee settlement.

The existing managed minimum/maximum evidence remains 3–8. Direct evidence permits 1–20. Seller disclosure is v2 and tied to the current listing version. Old evidence and audit history are not erased; current readiness requires reconfirming v2. Editing/withdrawing photos still invalidates readiness.

## Versioned acceptance

The existing business-setting version registry stores the complete bilingual seller-rules document. Public `/marketplace-rules` displays that document. One collapsed panel in the account/community workspace lets a seller read and explicitly accept it; drafts and existing messages remain available without acceptance. Requesting content review requires current accepted rules and current v2 disclosure.

Acceptance stores actor, policy version, full document snapshot, language and timestamp. Records are immutable. Repeating the same acceptance returns the existing receipt. A stale version, false/absent checkbox, anonymous caller, invalid language or changed text under the same version is rejected. A new policy version requires fresh acceptance and does not rewrite old receipts.

This initial document is explicitly a **staging review proposal**. Acceptance is allowed only in the synthetic staging database with its environment assertion. It is not acceptance of commercial fees or finalized Canadian legal terms. It does not switch any commerce flag on. Future commercially approved documents still need explicit review and publication; legal review is not replaced by this code.

The document covers accurate listings, known-defect photos/text, dispatch responsibilities, provider-confirmed payments, proposed issue/hold/evidence handling, distinction between accurate sizing/change of mind and misdescription, explicit return/refund details, human review and preservation of statutory/court rights. Marketing consent is not bundled in.

## Permission and state map

| Resource / action | Boundary | Effect |
| --- | --- | --- |
| marketplace_policy_document | Safe public projection | Current effective bilingual version only |
| marketplace_terms_acceptances | Private, RLS, no raw anon/authenticated/service-role grants | Immutable owner/version receipt; no bank/address fields |
| marketplace_accept_seller_terms | Authenticated non-anonymous caller, explicit acceptance, current version, EN/FR locale | Idempotent receipt + existing audit log |
| marketplace_seller_terms_status | Same authenticated caller only | Current document and own acceptance status |
| marketplace_request_review | Owner, current accepted rules, profile/price/current v2 evidence | Content review request only |

No existing order, wallet row, fee snapshot or managed commission rule is modified. Acceptance cannot authorize a payout, establish physical inspection or block support for previous transactions.

## Verification and limits

- 28 focused marketplace/photo/helper checks pass, including one-photo confirmation without side angles, mandatory defect evidence, authorization, managed regression, policy version changes, immutable/idempotent acceptance and review gating.
- Hosted synthetic Neon, restricted gateway: actor B's acceptance changed false → true; repeat returned the identical receipt timestamp and `commercialEnabled=false`. This is a synthetic test, not acceptance on behalf of the real customer.
- TypeScript and targeted lint pass. Node 22 preview build passed. Full suite: 201 tests, 194 passed and the same 7 recorded baseline failures remain; none were suppressed.
- The current browser connection is unavailable; no new Safari/iPhone or interactive checkbox acceptance test is claimed. Private photo upload still requires the separately requested storage-secret permission/configuration; this change does not transfer those credentials.
- Checkout policy acceptance, receipt confirmation, operational disputes, financial holds/refunds, provider onboarding and real settlement remain separate unfinished work. No numeric competitor deadline or foreign mandatory-arbitration clause was imported into commercial settings.

## Rollback

Roll back the account/rules entry points and deployment while retaining additive receipt history and audits. Do not delete acceptances/evidence or financial history. Restore any previous review RPC only after reviewing policy semantics; retain managed evidence controls. No production rollback is required because production was not changed.
