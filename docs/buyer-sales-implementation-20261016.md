# Shikimomo buyer sales implementation — 16 October 2026

Scope: `aminnikoozad/-lresale`, Vercel `lresale`. Baseline main / production: `977d178fd36d6341eecb99f0d6abf1e9ffad7a05` (PR #56). No other project changed.

Source: the owner's 14-page `مدل فروش.pdf` and the explicit approved requirements in this session. Companion Excel, technical brief and bilingual campaign files were not read or assumed. Proposed row/ad stock counts are not enforced as business rules. Owner explicitly chose **platform-funded** first-purchase discounts during this implementation.

## Implemented in code

- Buyer-focused `/shop` hero; removed seller campaign and long seller process from the buying page. Seller guide, navigation and shared buyer/seller account remain intact.
- Search includes size tokens. Size survives related department changes, shareable URL filters and history; clear chips remain available. In-stock clothing new arrivals, strictly `< 2500` cents and brand collections are hidden when empty.
- Quick view with the same card data, colour on cards, available alternatives ranked by size/type/price. Recommendations do not use Smart Shopping.
- Product detail supports available/reserved/sold through an additive RPC; old available-detail RPC remains a compatibility fallback until migration. Database errors produce a retryable page instead of a fake missing-item claim.
- Structured clothing front/back/size-label/defect photos and optional measured centimetres, MFA inventory action, audit log and publication gate. Existing published rows are not retroactively fabricated or repriced. First publication is immutable prospectively; existing `published_at` is the only backfill evidence and may not prove the earliest historical publication.
- Persistent cart retains unavailable lines with a warning, refreshes current price and stock from the server, and blocks continuation when verification fails. Server-side checkout preparation remains the authority.
- Account-bound first purchase code; default 10%, minimum CAD60, maximum CAD8, no stacking, deterministic cent allocation preserving CAD8 per item; atomic checkout claim and successful-payment consumption. Failed, cancelled and expired checkouts do not consume the code. Previous order offer terms are snapshotted. Seller commission bases remain unchanged; approved discount reduces platform earnings.
- MFA sales-admin control page `/admin/buyer-sales`: versioned offer settings, issued codes/uses, per-code disabling, message pause, manual campaign cost/attribution reporting, sensitive-change audit.
- Provider-independent payment/refund boundary, amount/currency/reservation checks, unique webhook and refund IDs, trusted service-only finalization and purchase/refund ledger. `/api/payments/webhook` always returns 503 until an actual provider adapter is connected and verified. Return review does not issue a refund. Partial/full confirmed refunds are recorded with bounded line/order amounts; seller reconciliation remains explicitly pending and code entitlement is not automatically restored.
- Optional account communication preferences with append-only consent evidence, account-independent token unsubscribe, transactional/marketing separation, suppressed incompatible queued messages, dry-run/claim checks for consent, inventory, prices, purchases and contact caps. Suggested follow-up times are preparation defaults, not activated schedules. No sender, SMS or campaign has been activated.
- Internal opt-in browsing events contain only event name/UUID/product IDs; no search text, URLs or customer identity is sent. Browser purchase/refund injection is rejected. Financial events come from verified order/refund transactions. No external analytics or advertising adapter is connected. Anonymous optional browsing analytics is not enabled.
- Public `/contact` form independent of account login, protected by the existing human/rate-limit mechanism. An MFA owner/admin guest-inquiry view is added. Submissions fail closed when the server database configuration is inconsistent; there is no fabricated email/telephone/address.
- EN/FR copy added. Brand hearts, entry animation, reduced-motion behaviour, Coming soon Smart Shopping and indexing were not redesigned.

## Database status and evidence

**No production migration was applied in this session.** No database was replaced or moved.

- Supabase connection is present. `list_projects` returned an empty list.
- `get_project` for both `lsdhobwrnmlkqnvkamlt` and `qisvbuqppovaemfmiujr` returned permission errors.
- `list_migrations(lsdhobwrnmlkqnvkamlt)` returned a permission error. Actual migration history remains unverified, including `20261015175400_team_managed_pricing.sql`.
- Organization list returned `opmmedsqoqlloufrsyqb`.
- Public `catalog_items_v3` on `lsdhobwrnmlkqnvkamlt` returned HTTP200 with an empty catalog. This confirms public API availability, not administrative ownership or the state of all data.
- Vercel `NEXT_PUBLIC_SUPABASE_URL` still points at `qisvbuqppovaemfmiujr`; storefront configuration still points at `lsdhobwrnmlkqnvkamlt`. This mismatch was not changed, and private credentials were not printed or used to bypass permission errors.
- Empty product inventory is not treated as a defect. The real gateway and real admin/customer transaction flow remain unverified.

Prepared migration files, generated with the Supabase CLI:

1. `20261016030302_buyer_sales_catalog.sql`
2. `20261016030427_buyer_first_purchase.sql`
3. `20261016030435_buyer_consent_measurement.sql`
4. `20261016030734_buyer_verified_payments.sql`
5. `20261016031156_buyer_guest_support.sql`

Before applying: reconcile actual migration history, inspect actual schema/function definitions, verify the correct project and authorized role, review data compatibility and run database advisors. Never run `db push` blindly. Payment and message delivery remain off after these migrations.

## Validation

- Full security/behaviour suite: 117 passing tests at the last complete run, including executable PGlite SQL integration tests.
- TypeScript and optimized production build passed. Lint: no errors; one existing `<img>` performance warning in seller item tracking.
- Local HTTP smoke: `/shop`, `/cart`, `/contact`, `/support`, `/unsubscribe` returned HTTP200; empty cart quote returned HTTP200 with no items. These are local server results, not production verification.
- SQL integration covers code ownership, MFA restrictions, threshold boundaries, cap and item floor, reservations excluding a second buyer, cancellation/expiry, failure, replayed successful payment, unchanged seller share, platform discount accounting, consent withdrawal, unsubscribe, price invalidation, provider gate, sold/reserved detail, photo publication, refund bounds/replay and campaign attribution.
- PGlite serializes work: this does **not** prove simultaneous sessions against production PostgreSQL. A real concurrent two-buyer test is still required after authorized staging access is available.
- Local browser installation failed and cloud browser inspection did not return usable page evidence. No mobile/visual E2E result is claimed. Authenticated customer/admin, payment provider and delivery-provider tests are blocked.

## Owner decisions / required information

Still needed: real support email, phone, business address, privacy contact and response hours; return window, return postage responsibility, return destination and refund authority; post-refund discount eligibility policy; real payment service and test credentials through a secure setup. Platform funding of the first-purchase offer is already decided.

No actual paid advertising, bulk marketing, SMS, payment, refund or seller payout was executed. Campaign reporting records owner-entered costs; it does not purchase advertising.
