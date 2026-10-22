# Hybrid marketplace — implementation and acceptance report

Review branch only. This is **not a completed Vinted/Poshmark-equivalent operational marketplace**. Commercial direct publication, purchases and payouts remain closed. No production migration or release performed.

## Delivered in this increment

- Merge the current main pricing controls, retaining preview isolation and the existing managed workflow. Scope the real admin pricing trigger to managed inventory; prohibit managed approval IDs on direct inventory. Use the existing safe price projection filtered to managed items, and owner draft RPCs instead of raw item reads.
- Account workspace at `/account/marketplace`: public seller profile, individual/business self-declaration, general city, vacation mode, following, private conversations, read receipts, in-app notifications and content review status. Private addresses, bank data and identity documents are not collected in public fields.
- Public shop at `/closet/[shop-id]`, 24 items per page, followed state and per-item contact/report actions. Only genuinely published eligible items are visible in production. Synthetic staging may explicitly invite one test identity to inspect a draft; that is not publication and exposes no private photo URLs.
- Buyer/seller text chat tied to inventory, owner-scoped RPC reads, blocked-user enforcement and bounded send/start rates. Only backend functions create structured offer system messages. There is no user API to assert payment or delivery.
- Structured single-item and multiple-item offers: integer CAD cents, exact inventory IDs and listing/price versions, seller/buyer/proposer/recipient, parent counteroffer, versioned expiry policy (24 hours initially) and status history. Changes to policy apply to new offers only; existing offers retain their policy snapshot and deadline. Reject duplicate item IDs, mixed owners, unpriced/unavailable inventory, active reservations, order history and vacation mode. Acceptance does not reserve or charge. Neither a buyer Bundle nor an accepted offer creates duplicate inventory or modifies the public price.
- Idempotent message/offer/report requests. UI retains the same request ID across an ambiguous retry and synchronously prevents duplicate submissions. Database request reuse with altered content is rejected.
- Existing draft editor now supports a version-bound content moderation request after current photos/disclosures, profile and minimum staging price. Repeated pending/approved requests do not duplicate the queue; rejected content must change before resubmission.
- Existing admin panel adds content/report queues with item capability, MFA and reason-required audit. Only reported messages are exposed to this queue. These functions have no transfer/payout/refund controls. Content approval leaves an item private, uninspected and unpurchasable.
- Explicit EN/FR interface text, compact cards and responsive layout. New translations are defined in the components; shared navigation strings are in the existing French dictionary.

## Data and permission map

Existing `items`, `clothing_listing_evidence`, `audit_logs`, financial ledger, managed Bag/pickup/orders and managed bundles remain authoritative. Existing managed bundles have a unique-item consignment purpose and cannot represent several buyers' competing Bundles; multiple-item negotiations therefore reference the same inventory IDs in offer snapshots instead.

| New private relation | Responsibility | Client boundary |
| --- | --- | --- |
| marketplace_sellers | Seller display profile and vacation setting | Owner writes by version; safe public projection uses random shop ID |
| marketplace_follows / marketplace_blocks | Real follows and communication blocks | Authenticated caller only; no raw grants |
| marketplace_threads / marketplace_messages | Item-bound private buyer/seller communication | Two participants only; no raw writes/system event spoofing |
| marketplace_offers | Versioned item or multiple-item negotiations | Parties only; recipient resolves; server revalidates inventory |
| marketplace_notifications | Durable in-app events, deduplicated by recipient/key | Recipient projection only; not an email delivery queue |
| marketplace_reports | Listing/message abuse reports | Reporter submits; MFA item staff reviews reported content |
| marketplace_listing_reviews | Version-bound content review | Owner requests; MFA item staff decides with audit |
| marketplace_rehearsal_access | Isolated synthetic draft visibility | No client grants; requires staging database name and explicit viewer/item allowlist |

RLS is enabled and all raw public/anon/authenticated grants are revoked on these relations. The RPC allowlist grants authenticated execution explicitly; public shop projection is the only anonymous reader. Runtime SQL uses static function/argument definitions and bound values. Staging calls assert the synthetic environment, set restricted claims and switch to `authenticated`; production uses existing Supabase authentication. Private staff support conversations remain separate because their participants and permission model differ.

## State and side effects

| Transition | Actor and precondition | Persistent effect | Financial effect |
| --- | --- | --- | --- |
| Save profile | Owner, expected version | Profile + audit | None |
| Send message | Participant, not blocked, rate within limit, request UUID | Message + deduplicated recipient notification | None |
| Send offer | Participant, same-owner unique items, current versions, no order/reservation, not on vacation | Immutable line snapshot + offer/system event/notification | None |
| Counteroffer | Pending unexpired offer recipient; same inventory IDs revalidated | Parent countered + new child pending | None |
| Accept/decline | Recipient; thread/profile/inventory locks, current lines and expiry | One result + audit/system notification | None; checkout still required |
| Expire/invalidate | Deadline or item/version no longer valid | Safe derived read status; response persists terminal state | None |
| Block | Participant, thread lock | Caller-owned block; old history retained | None; existing-order support is not removed |
| Request content review | Owner; current disclosure/profile/price | Version-bound pending queue + audit | None |
| Moderate | Item capability + MFA + reason + current version | Decision + audit + seller in-app notification | None; does not publish, inspect or authorize settlement |

## Executed checks and limits

Final security run: **198 tests, 191 passed, 7 failed**. The seven failure names match the previously recorded baseline navigation/profile-source, support/language-module and hero assertions. They were not suppressed or claimed fixed. All 25 marketplace/photo/helper checks, including six new community checks, passed.

- PostgreSQL authorization and social-commerce tests exercise two parties, a third user, staff and anon: messages, read state, block/unblock, request replay/misuse, rate limit, multiple-item counteroffers, expiry, listing edits, unknown price, vacation, public projection privacy, following, reporting, MFA and content review without publication.
- A combined test runs the actual main admin pricing trigger with the hybrid migration: direct seller price editing works; managed price changes without admin approval remain rejected.
- Real hosted checks use the restricted `staging_gateway` role and synthetic actors: create shops, item-bound thread, message, two-item offer, counteroffer, accepted result and idempotent repeated acceptance. Orders/wallet remain empty. These are database/provider-connection checks, not browser or financial-provider acceptance.
- TypeScript, targeted ESLint and preview build run with Node 22. Protected hosted workspace and shop fetches returned HTTP 200 with the expected synthetic profile, private thread and accepted-unpaid offer text. A corrupted generated Turbopack persistence cache was moved aside before the successful rebuild; no application bypass was introduced.
- Browser extension currently unavailable. An isolated Playwright browser installation also failed because the downloaded browser archive was invalid. Latest interactive UI and real Safari/iPhone acceptance remain unverified. Do not equate protected server HTML checks with browser E2E.
- Chat shows the latest 50 messages/offers; older-message retrieval and attachment handling remain work. Thread list has a 30-entry cursor; equal-timestamp pagination needs a secondary cursor before launch. Profile discovery is limited to 30 eligible shops.
- Offer expiry is enforced synchronously and projected on read. No scheduled expiry/email worker is claimed. In-app notifications work independently of email; email/SMS/push are not enabled by this change.

## Full requested experience — remaining gates

| Area | Actual state / next gate |
| --- | --- |
| Direct photo upload | Processing/private storage adapter built; standalone Neon Storage fixture tests passed. New Storage credentials have **not** been sent to Vercel; explicit destination-specific permission remains outstanding. Deployed upload stays disabled. |
| Publication & seller activation | Moderation queue built. Real contact verification, private shipping origin, versioned final terms, payment-provider onboarding and service-area enforcement remain necessary before publication/purchase. No fake physical inspection. |
| Offers & buyer Bundles | Negotiation built. Atomic paid inventory reservation, packaged parcel quote, final checkout and payment remain unfinished; accepting an offer does not sell an item. |
| Unified multi-seller cart | Existing managed cart retained. Direct seller/origin grouping and independent seller-group checkout remain unfinished. |
| Marketplace payments | Existing `buyerPaymentAdapter` is null. A Connect-capable provider account/test setup, signed webhook integration, idempotent sessions and late-payment recovery are not implemented/verified. |
| Ledger & settlement | Existing ledger retained. Marketplace pending/releasable/transfer/bank-payout/reversal accounting, hold/release concurrency and provider reconciliation remain unfinished. |
| Shipping | Existing managed Canada Post label code retained. Real seller origin, marketplace label purchase, carrier scans/tracking and initial-outbound branch QR eligibility remain unverified. No new labels purchased. |
| Delivery/disputes/returns | End-to-end marketplace receipt window, hold, evidence, return tracking, partial refund, chargeback and payout races remain unfinished. Existing support is not replaced. |
| Reviews | No ratings, sales counts or badges invented. Real qualifying-order review writes need verified completed marketplace orders. |
| Policies/economics | Draft proposal remains commercially inactive. Tax, Québec/Canada legal review, provider fee economics and commercial acceptance unresolved. Unknown costs/taxes are not zero. |
| Mandatory acceptance scenarios | Listing-to-test-payout, Bundle-dispute-partial-refund and full managed regression browser flows have not all been executed. No complete-readiness claim. |

## Provider findings (official sources checked 2026-10-21)

[Stripe separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers) distinguishes platform collection from connected-account transfers. Refund and transfer reversal are independent; availability and platform liability require a real Connect setup and review. No escrow or successful-bank-payout claim is made.

[Canada Post outbound public-key info](https://www.canadapost-postescanada.ca/info/mc/business/productsservices/developers/services/shippingmanifest/publickeyinfo.jsf) and [Create Shipment](https://www.canadapost-postescanada.ca/info/mc/business/productsservices/developers/services/shippingmanifest/createshipment.jsf) document provider-generated public label/QR information and expiry. This is not proof that the actual SHIKIMOMO account/service supports printerless retail acceptance. Do not create a replacement QR from an internal order URL or reuse returns QR eligibility for outbound shipments.

## Rollout / rollback

Keep this branch and PR in review. Keep direct purchase/publication gates closed and production untouched. Apply additive migrations only in isolated staging; compare exact migration, grants and managed controls before any later production approval. Review both EN/FR paths and two-account authorization in a browser when available.

Rollback the account/community entry points or deployment while retaining inventory, disclosures, private messages, moderation/audit history and all financial records. Do not delete evidence or cancel existing-order support. Roll back provider operations through provider-aware reconciliation/reversals, never by deleting ledger history. Disabling future direct purchases must not disable any future existing-order processing.

Later policy follow-up: see [seller rules acceptance and relaxed photo angles](marketplace-policy-acceptance.md). It supersedes earlier fixed-angle requirements and test counts.
