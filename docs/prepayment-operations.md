# REWEAR pre-payment operations

The site intentionally prepares orders without collecting money. A prepared order is **not** a sale, and staff cannot advance it until a future verified payment flow has recorded payment evidence.

## Deploy this foundation

1. Apply all pending `supabase/migrations/` files in timestamp order to the intended Supabase project, including `20261001023500_pre_payment_order_lifecycle.sql` and `20261001030000_order_operations_without_gateway.sql`. Confirm the migration history and the RPC grants in that project. The local PGlite tests do not apply migrations remotely.
2. Confirm that the target project matches the publishable URL/key in `lib/supabase/config.ts`. Set a **server-only** `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in production. Set a unique, random `CRON_SECRET` of at least 32 characters. Never expose either server secret through a `NEXT_PUBLIC_` variable.
3. Deploy production and check `/admin/readiness`. Vercel schedules `GET /api/cron/expire-checkouts` daily at 03:00 UTC; it sends `Authorization: Bearer <CRON_SECRET>`. Check deployment logs after the first run. The route fails closed without its bearer secret or the service client.
4. With a non-production buyer, prepare checkout and verify the saved policy versions and a ten-minute reservation. Cancel it and verify the inventory is released. Repeat with an expired reservation and verify the scheduled job expires its order. Confirm an unauthorized caller cannot reach staff or cleanup RPCs. Run `npm run test:security`, `npm run lint`, and `npm run build` before deployment.
5. With an MFA verified shipping admin, inspect `/admin/orders`. Paid orders alone can move from paid to processing to shipped (tracking required) to delivered. Owner/Admin can review returns there. Approval of a review does not move money or mark a refund.

The current checkout policy versions are pinned in `lib/legal-versions.ts` and in the private database policy-version row. When published policy content changes, update the two version sources together in one deployment. A mismatch rejects checkout and rolls back its reservation.

## Remaining launch gates

- Verify production configuration, email and CAPTCHA, Canada Post live quote, business contact and privacy contact on `/admin/readiness`.
- Decide applicable tax registration and server-side tax rules before charging buyers. The application does not infer a tax rate from a Canadian address.
- Confirm French customer content and policies for the intended market.
- Set the return period, refund authority, seller credit release and payout reconciliation procedures. Pending seller wallet entries are not payouts.
- Only in the final payment stage, connect a provider with signed and idempotent webhooks, server-calculated total and tax, cancellation/expiry handling, refunds and dispute reconciliation. Exercise the sandbox cases listed on `/admin/readiness` before enabling real charges.

Do not treat a successful local build or the presence of environment variable names as proof of a working production integration.
