# Owner payments and seller shares

`/admin/finance` reads the existing orders, order lines, seller credits, verified buyer refunds and wallet ledger. Only the current `admin_roles.role = owner` identity with `aal2` can call the reporting RPC. The page independently checks the role and MFA. No mutation or bank instruction is exposed. No new ledger, financial balance or commercial fee is created.

The initial view contains only name and CAD amount. Select the name to expand status, references, date, merchandise, platform coupon, shipping, tax, seller share, platform share and recorded refund reconciliation. The three sections separate buyer payments, seller earnings and historical payout ledger entries. Pages contain 30 rows. Internal IDs and payment references appear only in this owner-authorized projection. Addresses, banking data, keys and Checkout session URLs are excluded.

A `payout_debit` entry, including one with ledger status `completed`, is explicitly not evidence of a provider transfer or successful bank deposit. Bank reconciliation is not connected yet. Empty payout records are shown honestly. Gross commission and commission after platform-funded coupons are separate, and neither is called net profit. Recorded original earnings and reversal information remain visible after refunds.

## Commission audit

Managed consignment continues to use each item's locked seller basis points. Current sale price × locked rate is rounded once per existing inventory line. Later business settings do not recalculate existing credits. Existing team pricing, physical inspection and immutable commission guards remain unchanged.

Direct sale calculation uses the separate explicit policy argument to `marketplaceCommission`. The proposed 15% / minimum CAD1.50 remains unapproved and disabled commercially. At the proposal rate, CAD40 yields CAD34, CAD8 yields CAD6.50, and a CAD16 same-seller suborder pays CAD2.40 commission once. Seller-funded discounts reduce the commission base; platform coupons must not reduce seller proceeds. Shipping and item tax do not enter the merchandise commission base. Unknown fee taxes and operating costs are not treated as zero profit assumptions.

Direct financial checkout and payouts remain disabled: calculation tests do not establish that an operational direct-sale settlement flow exists.

## Verification, 2026-10-23

- 25 focused tests passed across finance reporting/calculations, buyer ledger/payment/refund tests, marketplace calculations, generated earnings migration compatibility and workspace navigation.
- A further 15 tests passed across the same 3 finance tests plus managed pricing and direct-sale guard regressions (37 unique tests across both invocations).
- ESLint passed on changed TS/TSX. Production build passed after discarding a corrupt local Turbopack cache.
- Migration applied only to isolated Neon `shikimomo_staging` after `assert_synthetic_staging`. Hosted query verified owner can see the original CAD18 pending seller credit for the actual sandbox CAD40 managed item; buyer identity denied. Real user authentication/MFA is not exercised by simulated staging claims.
- `/staging/finance` uses a fixed synthetic owner identity only in explicitly isolated preview. It is unavailable in production. It is not an alternate real admin login.
- No real funds moved, no production migration or release, no new provider connection, no bank payout tested.

## Rollout and rollback

Apply the additive migration before enabling the admin route in the production release. Verify current schema, owner role, real MFA and denial for non-owner staff in the intended Supabase environment. Stage and review before production. Reverting the UI/navigation hides the report without altering financial history or stopping payment receipt processing. The read-only function may remain installed; never delete or rewrite financial history as rollback.
