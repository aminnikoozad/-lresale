# REWEAR pre-payment operations

The site intentionally prepares orders without collecting money. A prepared order is **not** a sale, and staff cannot advance it until a future verified payment flow has recorded payment evidence.

## Deploy this foundation

1. Apply all pending `supabase/migrations/` files in timestamp order to the intended Supabase project, including `20261001023500_pre_payment_order_lifecycle.sql`, `20261001030000_order_operations_without_gateway.sql` and `20261002010000_item_inspection_publication_gate.sql`. Confirm the migration history and the RPC grants in that project. The local PGlite tests do not apply migrations remotely.
2. Confirm that the target project matches the publishable URL/key in `lib/supabase/config.ts`. Set a **server-only** `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in production. Set a unique, random `CRON_SECRET` of at least 32 characters. Never expose either server secret through a `NEXT_PUBLIC_` variable.
3. Deploy production and check `/admin/readiness`. Vercel schedules `GET /api/cron/expire-checkouts` daily at 03:00 UTC; it sends `Authorization: Bearer <CRON_SECRET>`. Check deployment logs after the first run. The route fails closed without its bearer secret or the service client.
4. With a non-production buyer, prepare checkout and verify the saved policy versions and a ten-minute reservation. Cancel it and verify the inventory is released. Repeat with an expired reservation and verify the scheduled job expires its order. Confirm an unauthorized caller cannot reach staff or cleanup RPCs. Run `npm run test:security`, `npm run lint`, and `npm run build` before deployment.
5. With an MFA verified shipping admin, inspect `/admin/orders`. Paid orders alone can move from paid to processing to shipped (tracking required) to delivered. Owner/Admin can review returns there. Approval of a review does not move money or mark a refund.
6. Audit existing listed non-Home inventory where `inspected_at is null`. The new publication trigger blocks future listing transitions without a recorded staff inspection but does not retroactively remove an existing listing. Staff must assess and record its condition; a checkbox is an accountable attestation, not automated proof of physical quality.

The current checkout policy versions are pinned in `lib/legal-versions.ts` and in the private database policy-version row. When published policy content changes, update the two version sources together in one deployment. A mismatch rejects checkout and rolls back its reservation.

## Remaining launch gates

- Verify production configuration, email and CAPTCHA, Canada Post live quote, business contact and privacy contact on `/admin/readiness`.
- Decide applicable tax registration and server-side tax rules before charging buyers. The application does not infer a tax rate from a Canadian address.
- Confirm French customer content and policies for the intended market.
- Set the return period, refund authority, seller credit release and payout reconciliation procedures. Pending seller wallet entries are not payouts.
- Only in the final payment stage, connect a provider with signed and idempotent webhooks, server-calculated total and tax, cancellation/expiry handling, refunds and dispute reconciliation. Exercise the sandbox cases listed on `/admin/readiness` before enabling real charges.

Do not treat a successful local build or the presence of environment variable names as proof of a working production integration.

## Non-payment test launch and new domain

Keep payments disabled throughout rehearsal. Record the exact preview commit and use an isolated test environment for sample inventory. Never publish sample stock to the live catalog or attest that an item was physically inspected unless staff actually inspected it.

Before inviting test sellers/buyers, verify:

- The intended database has the required migrations and configured pickup slots. A seller cannot select a collection window when none are available.
- Auth confirmation and recovery email work through the provider configured in Supabase Auth. A missing Vercel `RESEND_API_KEY` alone says nothing about Supabase Auth email delivery.
- A staff user can complete MFA and record a real inspection; publication without that evidence is rejected. Preserve the $8 item and $60 estimated Bag minimums.
- A test buyer can prepare and cancel an order, stock is released, and reservation expiry is verified. The scheduled cleanup endpoint requires the server-only service key and `CRON_SECRET`; do not infer a working job from the cron schedule alone.
- Mobile/desktop navigation, category reset, empty inventory, seller guide and interrupted authentication work. Empty inventory permits browsing/auth rehearsal, but it cannot prove inventory, inspection, checkout or fulfilment flows.

When the main domain is connected, verify DNS/TLS and update `NEXT_PUBLIC_SITE_URL`, the Supabase Auth Site URL and approved redirect URLs, and Edge Function `ALLOWED_APP_ORIGINS`. Update Turnstile hostname configuration if enabled. Then repeat signup, recovery and authenticated function calls on the new domain. Domain purchase or DNS alone does not update these integrations.
