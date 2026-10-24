# Automatic photo price review

Implemented on `feat/automatic-visual-pricing`, based on main `871f643`.
Not activated or installed on production. No SerpApi account/key has been supplied and no live provider search has been made.

## Behavior

An item photo upload or change to visual attributes queues a private job automatically, including seller P2P uploads and managed clothing evidence. Photos are grouped for 90 seconds before processing. The worker chooses the registered front image (or another registered item image), using a 120-second signed URL for the private Supabase bucket. Existing public images are supported only from this project's own Supabase Storage public-object origin. Arbitrary user URLs and Neon staging storage are not sent to the provider.

The SerpApi Google Lens `visual_matches` API searches the actual image. No OpenAI calls or token charges are involved. Normalized results retain title, source link, supported thumbnail, listed price, explicit currency and declared comparable condition. Google visual matching does not verify a model, authenticity, material or condition. There is no fabricated model description or calibrated similarity score. Missing prices remain missing. The tool does not fetch arbitrary result websites, bypass login walls, or infer a sold price from an active advertisement.

A median and quartile range use explicitly priced used matches when available, otherwise the available mixed asking prices. All visual estimates are marked low confidence. An empty price set shows no estimate. CAD is native; USD/EUR/GBP use dated Bank of Canada daily rates no older than seven days. An ambiguous bare dollar sign is not assumed to mean CAD. Missing FX excludes that result from CAD estimation while retaining its original price.

`/admin/visual-pricing` is an EN/FR queue with item photo, approximate CAD price, expandable visual matches, review history and a final decision form. Owner/admin MFA is required for a decision. A managed decision calls the existing final-price approval function atomically, retaining physical inspection, seller mandate, commission locks, reservation guards and the CAD 8 floor. Publication is separate. For P2P, a review is recorded privately; the seller's price and separate moderation/publication flow remain intact.

Changes invalidate queued/in-flight results, and stale estimates cannot be approved. Decisions are append-only and one per job; repeated review cannot silently overwrite the price. Completed suggestions expire for approval after seven days. Explicitly queueing an unchanged item on a later UTC day makes a fresh job; same-day requests reuse it. Failed same-day jobs can be requeued by MFA staff, within the database call limits. No old inventory is automatically backfilled or sent externally.

## Cost and operating controls

Independent visual-search ON/OFF control defaults OFF. It does not enable the older deterministic pricing engine. Only owner/admin MFA can toggle it; turning it off invalidates running leases. Manual managed pricing remains available.

Database-enforced caps: 200 reserved attempts per rolling 31 days, 40 per rolling hour, four per item per rolling 24 hours, at most two worker attempts per queued run. Reservations count even failures before reaching the provider, deliberately conservatively. These caps cover this worker only; account usage elsewhere consumes the same SerpApi account quota. One invocation processes one image; multi-photo uploads do not trigger one API call per photo. Same-day identical content is cached. No automatic plan upgrades, paid subscriptions or account changes are performed.

## Configuration and rollout

1. Apply `20261024041120_automatic_visual_pricing.sql` to an isolated staging database containing the existing pricing, hybrid-sale and seller-photo migrations. The migration is additive and creates no public table grants. Run database security advisors in that environment.
2. Configure `SERPAPI_API_KEY` in the server's environment secret manager, never `NEXT_PUBLIC_*`, source control, this document or chat. Set existing matched `SUPABASE_URL` and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` (at least 32 characters). Public Supabase configuration must point to the same staging project. The UI never returns credentials.
3. Deploy the matching application. `/api/cron/visual-pricing` requires the exact Bearer cron secret. `vercel.json` schedules every ten minutes; confirm the hosting plan supports that frequency. An existing external authenticated scheduler can invoke the same endpoint if needed. An MFA owner can also process one waiting item manually in the admin queue.
4. Connect a free SerpApi account, enable visual search in the staging admin page, upload front/back/label photos and wait 90 seconds. Confirm one search, private queue visibility, price/no-price handling, changed/deleted images, managed final approval and P2P price preservation. Test the real provider on representative categories: this has not been possible without an API key.
5. Only after that real staging acceptance, apply the migration and deploy together to production, verify the admin queue, configure the server key and scheduler, then explicitly activate visual search. Existing main deployment remains untouched by this draft branch.

The input image is shared with SerpApi/Google for visual search. Review the site's photo-processing notice and provider terms before activation. Only normalized public comparable evidence is persisted; signed input URLs, raw provider responses, API keys and provider metadata are not stored in the job result or audit log.

## Validation

- Seven new tests exercise estimation, missing/ambiguous prices, FX freshness, private image selection, automatic queueing, permissions/MFA, stale leases, pause/resume, managed approval, P2P ownership and global budgets against the actual SQL migration using PGlite.
- Twenty-nine existing targeted tests passed covering pricing, commission, real local checkout/payment/refund ledger behavior, seller upload preflight, listing submission, navigation and security headers.
- TypeScript, production Next.js build and repository ESLint passed (one pre-existing image warning in the seller items page). Checks ran with Node 24.19 in this workspace; the deployment target remains the repository’s Node 22 engine.
- No live API call, real admin/MFA browser test, production migration or activation is claimed. Local fixtures do not replace live staging acceptance.

Official references used: https://serpapi.com/google-lens-api, https://serpapi.com/google-lens-visual-matches-api, https://supabase.com/docs/guides/storage/serving/downloads, https://www.bankofcanada.ca/valet/docs.


## Email alert for pending clothing prices

`20261024042315_visual_price_review_email.sql` adds an independent transactional email outbox. When a clothing estimate completes with a price and awaits review, one message is queued for each explicitly subscribed owner/admin. Each owner/admin can enable **Email my admin account** in the photo-price queue. This uses that signed-in account’s verified Auth email; it never guesses a personal address or subscribes other admins. Enabling includes still-current, unreviewed estimates from the last seven days. P2P review notifications do not grant team authority over the seller’s price.

The email includes item/brand/size, suggested CAD price/range and a secure link to the exact item, even beyond the first queue page. Photos stay behind the admin login/MFA. HTML values are escaped and the subject excludes control characters. The URL is a GET-only review link: email security scanners cannot approve a price. The final decision remains an authenticated admin action.

A separate one-minute Supabase `pg_cron` worker uses existing `pg_net` and Resend configuration. It reads the dedicated Vault secret `shikimomo_pricing_resend`, or the existing `shikimomo_pickup_resend` fallback, and sends from the existing `notifications@shikimomo.com` identity. No key is copied into source code or exposed to the client. Missing credentials leave email pending and do not reverse a completed estimate. Verify that this sender is authorized by the configured key before production activation.

The durable per-estimate/per-recipient unique key and stable Resend idempotency key prevent duplicate retry sends. Transient failures use capped backoff; permanent 4xx errors stop. Retry stops after 23 hours, inside Resend’s 24-hour idempotency retention. Reviewed, changed, expired or withdrawn items and unsubscribed/removed admins are skipped before a pending send. A message already handed to the provider may still arrive after a subsequent decision. Provider **accepted** is displayed separately from actual inbox delivery; no live delivery has been tested or claimed.

Four additional database tests use stubbed HTTP/Vault/cron interfaces, with no external mail. They verify the completion event, recipient verification/MFA, deduplication, escaped content, exact-item link, provider acceptance, stable retry payload/key, 4xx/429 handling, retry cutoff, opt-out/review cancellation and independence from missing credentials. Production installation/subscription and a real end-to-end delivery check remain pending.

## Review audit — 24 October 2026

The audit reproduced three concrete failures before correcting them: an even-sized sample returned the upper middle asking price instead of a true median; product IDs contained in query parameters were incorrectly removed by deduplication; and an approval through the existing item-pricing workspace did not cancel a pending "awaiting approval" email.

The estimator now interpolates median/quartiles, preserves meaningful product query parameters, strips known tracking parameters only, and can upgrade an unpriced duplicate when a usable price is present. The additive `20261024044040_visual_review_audit_fixes.sql` respects managed approvals from either workflow and suppresses emails for older analyses of the same current item revision. It also turns exhausted queued jobs into visible failures so staff can explicitly retry, rather than leaving them queued forever. Existing function grants, MFA, publication rules and commissions are retained.

Three new regression tests reproduced the original failures. Additional checks cover duplicate-price enrichment, newer-estimate email cancellation and exhausted-job recovery. The audit's estimator/email set passed all 13 tests; 19 broader existing pricing/commission/queue checks also passed (32 total for this audit). TypeScript and targeted ESLint passed. No live provider accuracy, authenticated visual-browser acceptance or real inbox delivery is claimed. The SerpApi variable was still absent from the Vercel project when inspected after the purchase message; a paid account alone does not configure the server connection.


## Photo-first admin intake connection — 24 October 2026

The item-intake wizard now sends its first prepared image to `/api/admin/intake/price` before any owner, category or price is stored. The server requires an authenticated item-staff session with MFA, checks the visual feature control and provider readiness, bounds incoming bytes, decodes the real image and removes metadata. A temporary private photo session is stored in the existing private `shikimomo-listing-photos` bucket. No fictitious item, inspection, owner or price is created for analysis.

The photo hash and request UUID deduplicate retries. A durable intake lease shares the existing 200/31-day and 40/hour provider budget. The current worker can process either a pre-intake image or a saved item. Up to two attempts are reserved for an intake; identical photos for the same admin are cached during the 24-hour session. Different admins have isolated sessions. Browser disconnection is not reported as a completed search. Pending work is recoverable through the admin queue's worker action or scheduled worker; the Hobby-compatible deployment schedule is daily, while the first request awaits its own job immediately. There is no claim of a ten-minute automatic retry on the current plan.

The wizard shows the actual normalized result, CAD range, low-confidence label and source links. Insufficient evidence has no price. Suggested values only prefill the provisional input, and later results do not overwrite an admin's manual edit. New first photos invalidate the UI's previous request/result. Other attributes remain short sequential choices. Final save waits for the active search request to return, and the existing server action checks the first photo hash before associating the temporary suggestion with the saved item. This association never approves a price or publishes an item. Existing recorded inspection, pricing mandate, commission and publication guards remain authoritative.

Migration `20261024200029_photo_first_visual_intake.sql` adds private session storage, authorized status/upload/association RPCs, service-only claim/finish RPCs and pause-time lease invalidation. The earlier three visual migrations plus this migration were installed additively on the main project with the visual feature still OFF. No provider request or notification was sent during installation. Existing tables' financial histories were not modified. Temporary sessions expire after 24 hours; automatic removal of their underlying search-image objects is not yet implemented. Private session rows remain as operational evidence.

Runtime configuration still requires `SERPAPI_API_KEY` as a Production Secret. No value belongs in source, client code, reports or chat. Once configured, redeploy and enable the independent visual switch as MFA owner/admin. Make one real image search and check real provider sources, a no-price response, final item association and the owner-only email subscription before describing the provider integration as verified. An email provider acceptance is not a proven inbox delivery.

Validation: 23 focused tests pass on Node 22, including the new session's MFA/ownership, no-item-before-metadata, upload completion, deduplication, lease fencing, pause/resume, shared quota and safe association without financial approval. Clean production build, TypeScript and targeted ESLint pass. Full historical security tests include unrelated existing UI expectations; the same navigation/support failures reproduce on unchanged main. No real SerpApi or authenticated browser transaction has yet been completed.

Rollback: revert the application change and leave the visual feature off. Keep the additive private schema and audit rows; do not delete financial data, alter commission snapshots or interrupt existing orders.
