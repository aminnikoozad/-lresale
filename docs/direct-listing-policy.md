# Direct clothing listings — evidence, permissions and release gates

Implemented on the hybrid review branch; not a production launch. Commercial marketplace purchases remain disabled.

## Account experience

The existing seller dashboard presents both selling methods. Bag and own-box pickup dialogs remain in the managed card. The direct card opens `/account/seller/direct`. The buyer account links to this choice. Managed item counts/commission previews exclude direct inventory. A seller can keep using both methods within the same account.

Direct listings are compact cards. Add clothing and Edit open an exclusive editor. Pages show 12 cards rather than hundreds of open forms. The database currently returns at most 400 entries, with active drafts first; older archive pagination is still a limitation.

## SHIKIMOMO photo and disclosure rules

- Real item, seller's own clear photos; no stock/AI substitutes or edits hiding condition.
- Four distinct views: front, back, left and right. A brand/size-label photo is required unless the seller explicitly declares that no label exists. Conflicting label declarations are rejected.
- Declare every known stain, hole, repair, missing component and sign of wear. Each defect entry needs a processed close-up and a specific description. The saved listing's overall defect description must also be complete. No-known-defects and defect entries/text cannot coexist.
- No guessing of unknown details. The seller must check any AI-suggested text.
- The saved item needs a condition and descriptive text before evidence confirmation. Incomplete drafts remain allowed; they cannot be sold.
- Confirmation records seller identity, time, listing version and `seller-disclosure-v1`. Editing content/photos or withdrawing photos invalidates readiness. Documentation is not moderation approval, physical inspection, authenticity certification or payout approval.
- Settlement still needs valid payment, delivery, completion/review conditions, no active dispute/chargeback/hold and provider eligibility. Complete photos do not guarantee release or remove statutory rights.

## Source research (checked 2026-10-20, Montréal)

[Official Vinted UK Catalogue Rules](https://www.vinted.co.uk/catalog-rules) require correct condition and description of defects/alterations/missing parts, original clear actual-item photos and one listing per physical item. Their private/Pro selling distinction is market-specific. These UK commercial, legal and shipping terms have not been adopted as Canadian SHIKIMOMO terms.

[Poshmark Canada Seller Policy, in its Legal Center](https://poshmark.ca/terms) assigns sellers responsibility for truthful, complete descriptions, original photos, condition/flaws and checking AI-generated listing text. [Its seller guide](https://poshmark.ca/posh_guide/tips_how_to_make_first_sale) recommends measurements and wear/flaw photos. The policy distinguishes ordinary seller listings from items physically evaluated by the platform. These findings support SHIKIMOMO's disclosure design; competitor payout deadlines, account-age rules, commissions and contracts are not automatically adopted.

## Data and permission map

| Resource | Writer | Reader / boundary |
| --- | --- | --- |
| Existing `items` | Existing guarded draft and lifecycle RPCs | Existing owner RLS/private projection; public catalog only already-published eligible inventory |
| `private.marketplace_photo_assets` | Trusted server registration RPC; owner soft-withdrawal RPC | No raw customer/anon table grants; private owner RPC only |
| Existing `clothing_listing_evidence` | Existing staff RPC for managed; owner confirmation RPC for direct | No new raw customer grants; existing public item projection remains publication-scoped |
| Private object bucket | Branch-scoped server credential | Owner-authorized API streams WebP with private/no-store; no public bucket or persistent signed URL in browser |
| Existing audit log | Evidence/upload/withdrawal RPCs | Existing staff permissions; no financial credits |
| `catalog_sale_provenance` | Read-only | Public fields only: mode/custody/shipper/inspection flag; no addresses, account identity or costs |

The trusted registration function is not executable by `anon` or `authenticated`. The synthetic gateway receives a separate execute grant only in Neon commissioning, outside the portable migration. Service-owned uploads briefly establish the already-authenticated owner context for the existing item guard and restore the original claims. This does not grant users a role or staff access.

Provenance badges distinguish seller-listed/seller-shipped from managed inventory. The inspected badge additionally requires a managed item, an inspection timestamp and the actual physical-inspection audit event. Seller photos/attestation cannot create it. Missing provenance is not treated as verified inspection.

## Image processing and operation limits

Uploads authenticate before reading content, recheck draft ownership/version before transfer and again under a database lock, and reject orders/active reservations. Magic bytes and actual decoding determine image acceptance; filename/MIME alone is insufficient. Sharp applies orientation, strips metadata, bounds input to 3 MB/24 megapixels and output to 1800px/1.5 MB WebP, and rejects undersized/animated/invalid images. Unsupported HEIC decoding returns an explicit JPEG-export instruction; actual iPhone/Safari HEIC acceptance is not established.

Use at most 20 active distinct processed photos per item and 80 registrations per seller/hour. SHA-256 prevents identical bytes filling multiple view slots. These checks cannot prove that a seller assigned the correct view or disclosed every hidden flaw; moderation and dispute evidence remain necessary.

Object keys are unique to owner/item/upload UUID. Conditional create prevents silent replacement, and retry checks compare the stored hash. Database registration is idempotent for the same asset/payload. Withdrawal soft-removes the asset from the draft and keeps private bytes/audit history. If object transfer succeeds but database registration fails, an inaccessible orphan may remain. Orphan reconciliation/retention policy is a remaining launch gate; do not erase historical order/dispute evidence in cleanup.

## Integration and current blocker

Neon private Storage bucket creation and independent synthetic upload/download were verified. Four processed fixture objects round-tripped with matching hashes; repeated conditional PUT returned 412. Hosted SQL accepted four-view seller evidence, retained `inspected_at = null`, denied raw seller/anon registration and restored service claims. The fixture was archived after testing; no platform sale, order or wallet credit was created.

Automatic approval review rejected transferring the newly created branch storage credential into Vercel preview Secrets because explicit permission to disclose that credential to Vercel was not recorded. The action was not retried or bypassed. The preview upload adapter remains disabled until that specific permission and configuration are complete. Do not claim browser upload/download acceptance yet.

For the existing Supabase-backed account path, the adapter also requires an explicitly enabled server flag, a same-project server service key, and a **private** `shikimomo-listing-photos` bucket. This has not been provisioned or exercised on production. Never reuse the public managed `item-photos` bucket for private draft assets.

## Verification and rollout

19 focused PostgreSQL/image/helper tests passed; TypeScript, targeted lint and preview build passed. This includes real decoding/EXIF stripping, malformed files, SQL authorization, required views/label/defects, stale evidence and managed publication regression. Provider Storage checks are separate from simulated-identity SQL and local fixtures. Real account/MFA, uploads through the deployed browser, Safari/iPhone, moderation and settlement E2E remain required.

Apply only to isolated staging first. Keep direct publication and checkout closed. Review the exact preview before any production permission request. Roll back the UI/entry points while preserving additive inventory/evidence columns, asset registry, private objects and audit history. No ledger/order history may be deleted. An upload kill switch must not erase evidence or interrupt existing-order handling.

Full security run after this change: **172 tests, 165 passed, 7 failed**. The failure names match the seven previously reproduced on untouched main: two account-workspace assertions, unsigned-in support copy, site-language VM/module loading, old hero expectations, and two support-page assertions. They were not suppressed or claimed fixed.
