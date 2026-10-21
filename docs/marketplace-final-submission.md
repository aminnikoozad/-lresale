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
