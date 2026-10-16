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

**Seven migrations were committed to production `lsdhobwrnmlkqnvkamlt` through the authenticated Supabase SQL Editor on 16 October 2026.** No database was replaced or moved.

- After explicit owner approval of browser fallback, the signed-in dashboard showed the project in **my second hand shop**, organization `aezehianbxzztdwyqeqr`. Project status was Healthy. The connector only exposed organization `opmmedsqoqlloufrsyqb` and denied project operations; the reason for that scope difference remains unknown.
- Real migration history ended at `20261015061741 smart_shop_admin_controls`. Names and actual function definitions were inspected rather than assuming repository timestamps matched production.
- Applied, in order: `20261015175400_team_managed_pricing`, `20261016030302_buyer_sales_catalog`, `20261016030427_buyer_first_purchase`, `20261016030435_buyer_consent_measurement`, `20261016030734_buyer_verified_payments`, `20261016031156_buyer_guest_support`, `20261016034843_buyer_discount_legacy_total_guard`.
- The last migration fixes the actual production legacy `orders_check` lower bound so valid discounted totals can fall below the original subtotal. It retains a discounted-subtotal floor and enables RLS on the private payment connection table.
- The complete batch passed a production transaction ending in ROLLBACK before the same batch was committed. Both executions compared hashes of existing item prices/commission locks and all original order fields; no changes were detected. Migration history was recorded in the same transaction.
- A separate post-commit query confirmed all seven migration records, all 14 new tables with RLS, the exact formula (CAD60 -> CAD6; CAD100 -> CAD8 cap; almost-all CAD8 lines -> only one cent available), and denied public code reads, authenticated direct code updates, and browser execution of payment confirmation.
- Live public API after commit: new product-detail RPC HTTP200/null for an unknown ID; mandate/admin RPCs HTTP401/42501 without authentication; unknown unsubscribe token HTTP200/false. These endpoints no longer return missing-function errors.
- **Offer settings remain disabled**, with approved values 10%, CAD60 minimum, CAD8 cap and platform funding. Enabling through the app still requires the existing sales administrator + MFA flow; it was not bypassed using SQL impersonation.
- **Payment, marketing delivery and SMS remain disabled**, with no provider selected. No real order/payment/refund was created as a production test.
- Vercel `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` both point at `qisvbuqppovaemfmiujr`. The decoded project reference in its existing `SUPABASE_SERVICE_ROLE_KEY` also points there. Its opaque `SUPABASE_SECRET_KEY` cannot be attributed from its format alone. Values were never printed. No keys were sent to or database queries run against that other project.
- **Subsequent runtime repair:** the existing secret key from the authenticated API Keys page of `lsdhobwrnmlkqnvkamlt` was securely transferred without printing its value or creating a new key. A real service-only `claim_buyer_message` dry-run against an unknown UUID returned HTTP200/unknown_message, proving the key was accepted with service-role access. A direct settings-table read correctly returned permission denied; no unnecessary table grant was added.
- Updated `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and all four public key aliases to this project. Replaced both private key aliases with the verified modern secret, restricted to Production and stored as Sensitive. Preview receives no privileged database credential from these variables. Existing database data was not copied or moved.
- Redeployed the unchanged main commit `db352c9f744df1cd2d30b1199f241355119164f4` as production deployment `dpl_432r4zeemVc67iV3gp7XmvgRKbky`, which reached READY. Live `/contact` returned HTTP200 with its form enabled and no configuration-error message; `/shop` returned HTTP200. Browser inspection independently confirmed the form fields and submit control were enabled.
- The cleanup HTTP endpoint rejects an unauthenticated request with HTTP401. An authenticated run through that endpoint has not been verified because its pre-existing sensitive cron token cannot be read back. No cron token was rotated and no expired production orders were changed as a test. The limited Supabase connector scope also remains; the runtime repair does not change connector authorization.
- Other old `POSTGRES_*`/JWT environment entries are not read by the application runtime and were not repointed using guessed database passwords. Payment, marketing and SMS remain disabled; no guest inquiry was submitted as a test.
- Empty product inventory is not treated as a defect. Real gateway and authenticated admin/customer end-to-end flows remain unverified.

Production website changes from PR #57 were merged at `4b9743623599d05de35ac8fc45103ad764d1469b`; Vercel deployment `dpl_wBpAWmrv8uAxrw1SAqmaTAgLgV73` reached READY. Live EN/FR shop/contact/unsubscribe responses were checked; unsigned admin requests redirected to secure login and the payment webhook remained HTTP503.

## Validation

- Full security/behaviour suite: 118 passing tests at the last complete run, including executable PGlite SQL integration tests.
- TypeScript and optimized production build passed. Lint: no errors; one existing `<img>` performance warning in seller item tracking.
- Local HTTP smoke: `/shop`, `/cart`, `/contact`, `/support`, `/unsubscribe` returned HTTP200; empty cart quote returned HTTP200 with no items. These are local server results, not production verification.
- SQL integration covers code ownership, MFA restrictions, threshold boundaries, cap and item floor, reservations excluding a second buyer, cancellation/expiry, failure, replayed successful payment, unchanged seller share, platform discount accounting, consent withdrawal, unsubscribe, price invalidation, provider gate, sold/reserved detail, photo publication, refund bounds/replay and campaign attribution.
- PGlite serializes work: this does **not** prove simultaneous sessions against production PostgreSQL. A real concurrent two-buyer test is still required after authorized staging access is available.
- Local browser installation failed. A later authenticated cloud-browser session successfully verified production database changes. No mobile/visual shopping E2E result is claimed. Authenticated customer/admin, payment provider and delivery-provider tests are blocked.

## Owner decisions / required information

Still needed: real support email, phone, business address, privacy contact and response hours; return window, return postage responsibility, return destination and refund authority; post-refund discount eligibility policy; real payment service and test credentials through a secure setup. Platform funding of the first-purchase offer is already decided.

No actual paid advertising, bulk marketing, SMS, payment, refund or seller payout was executed. Campaign reporting records owner-entered costs; it does not purchase advertising.
