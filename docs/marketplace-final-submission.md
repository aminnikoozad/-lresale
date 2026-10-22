# Direct listing composer and final submission

Implemented on the hybrid marketplace branch only. Production is unchanged.

- The Sell workspace has one **Add clothing** button. Each saved item has **Edit / Photos**. A native modal dialog mounts its contents only when opened, supports Escape, focus containment and a 44px close target. The Buy workspace and managed Bag/pickup flow remain separate.
- The modal accepts one photo at a time by drop or the native file chooser. The local preview is explicitly unsaved. A new listing saves its private draft first, keeping the selected photo for the evidence upload. Existing secure processing, defect photo/text validation and label declaration remain authoritative. Additional angles are optional.
- Draft saves stay in the dialog. Request receipts in the existing audit log prevent duplicate drafts after a retry. Owner, sale mode, status, price authority and active-order protections remain in the existing save RPC.
- At the end, a small collapsed rules box exposes the current EN/FR policy. An unchecked, required checkbox is separate from the disclosure attestation. Prior account acceptance never skips this final checkbox. Unsaved detail edits disable final submission.
- `marketplace_submit_listing` atomically validates explicit consent and current policy, locks/checks the owned listing version, validates evidence/profile/price, queues admin review and writes an immutable per-listing acceptance receipt. Any failure rolls back all writes from that submission. Replays with explicit consent are idempotent.
- The legacy two-argument review RPC rejects submissions, so it cannot bypass final consent. The private review core has no client grants. Receipt tables have RLS enabled and no raw client grants. Policy snapshots remain in the existing immutable terms acceptance table; submission receipts reference them.
- Pending, content-approved and changes-requested badges refer to the current listing version. Existing capability/MFA-protected moderation handles the queue. Content approval does **not** certify physical inspection, publish the item or activate checkout. Publication still requires later launch/provider gates. Managed inspection, publication and pricing rules are unchanged.

## Validation and limits

Thirty focused database, policy, photo-processing and helper tests pass, including atomic rollback on incomplete evidence, explicit consent after prior acceptance, owner isolation, stale policy/listing rejection, retry receipts, admin MFA, immutable receipts, and approval without publication/inspection. These use PGlite fixtures; hosted synthetic staging checks are reported separately.

Photo selection/preview is local. Private object-storage credentials are not configured in Vercel, so browser upload remains disabled. Do not treat a chosen photo as uploaded. No live payment, payout, carrier or legal-policy approval is implied. Browser/Safari interaction must be verified separately; TypeScript and build checks do not establish browser E2E coverage.

## Rollout and rollback

Apply `20261021203658_marketplace_final_submission.sql` after the community and seller-policy migrations, in isolated staging first. It adds receipt data and RPCs without deleting history or changing existing financial records. Ship UI and RPCs together. To stop new submissions, remove the composer entry point or deny the new RPC; preserve all receipts and the existing admin queue. Do not restore the legacy consent-bypassing review RPC. Existing orders and financial workers must remain operational.

Recorded validation for this change: TypeScript, targeted ESLint and a Node 22 preview build passed. The full security suite completed with 203 tests: 196 passed and the same seven pre-existing navigation/support/language/hero failures documented before this change. Hosted Neon checks ran through the restricted `staging_gateway` role: same-request draft retry returned one listing, missing consent was rejected, incomplete evidence was rejected, and the legacy review RPC was rejected. Hosted checks did not upload an image or exercise a complete browser submission. The new migration was applied only to `shikimomo_staging`; orders and wallet transaction counts remained zero at installation.

## Owner-requested production submission rollout — 2026-10-22

The owner requested the feature on the main site while preserving its layout. The original storefront and buyer-page source are retained. The managed seller dashboard keeps its existing Bag/pickup controls, balance and tracking layout; only a compact two-link selling-method selector is added. Direct drafts remain in their dedicated Sell route.

Migration `20261022115748_direct_submission_rollout.sql` adds policy v2 strictly for private listing submission, explicitly excluding transaction terms, charges, future fee acceptance and payouts. Review-only staging v1 receipts are not accepted as current production consent. Existing policy snapshots remain immutable. Current-version moderation now includes private processed photos, defects, item details and a consent receipt; photo access requires ownership or item capability plus MFA and a current moderation record. A private WebP-only Supabase bucket uses the existing production server credential. The Neon preview keeps its separate adapter and credentials.

All eight additive marketplace migrations were installed on the confirmed production Supabase project. The migration tool twice returned an expired requestState; after checking that it had not applied anything, the same connector’s SQL endpoint executed reviewed migration bodies transactionally and stored the exact source/version/name in schema_migrations. The oversized combined request also failed without applying; individual migration transactions succeeded. No customer acceptance was recorded on anyone’s behalf. Counts at postflight: orders 0, wallet rows 0. New marketplace purchases and AI Pricing remain off. Raw receipt access and anonymous submission are denied.

Validation: 32 focused checks pass; 205 full-suite tests, 198 pass and the same seven previously documented failures. TypeScript, targeted ESLint and the local Node 22 production build pass. Generated Turbopack cache was moved aside after a persistence error; CLI/build telemetry was disabled after automatic review rejected incidental telemetry. Production browser checks requiring sign-in remain limited by the sign-in wall; no credentials or CAPTCHA were entered.

Rollback UI to Vercel deployment `dpl_24cBegQxZRKMXVq3nDQtyBBD7ZBY` if necessary, keeping the additive schema and all consent/audit/financial history. Disable `MARKETPLACE_MEDIA_ENABLED` to stop new uploads; retain existing private objects and moderation records. Do not drop tables, delete ledger history, restore the legacy review bypass or stop existing-order processing.
