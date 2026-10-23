# Stripe sandbox integration — 2026-10-23

This is an isolated integration harness, not marketplace launch approval. Production payment and AI gates remain unchanged. Public storefront and managed intake layout are unchanged.

## Built

- Stripe SDK 23.0.1, hosted CAD/card Checkout and Express onboarding. Server requires Vercel preview, Neon staging, test credentials, exact preview origin and expected Canadian platform account.
- Existing orders, payment attempts, webhook inbox, inventory reservations, seller credits and wallet transactions remain the financial source of truth. No parallel ledger.
- Signed raw-body webhook receipt is persisted before processing. A worker retrieves provider evidence, checks account, amount, currency, order, attempt and payment intent, then calls the existing verified payment boundary. Redirects never finalize payment.
- Stable provider idempotency keys and database account/session binding. Late successful payments stay in reconciliation review; they do not resell stock or credit the seller.
- One event claimed per HTTP worker invocation, a two-minute lease, 90-second worker budget, bounded retries and manual review after exhaustion, including worker crashes on the final attempt.
- Synthetic seller identity and private Stripe account mapping. Draft/profile creation is separate from provider onboarding. This harness is not real authentication and must stay behind staging access controls.
- EN/FR test page `/staging/payments`, with disabled controls until environment configuration. Direct checkout and seller transfer/payout are deliberately blocked.

## Applied and verified

Migration `20261023031310_stripe_sandbox_integration.sql` applied only to Neon project `autumn-bonus-01926496`, branch `br-flat-shape-b575grbs`, database `shikimomo_staging`. Connection remains disabled with no configured platform account. The final claim function was reapplied after adding crash-exhaustion handling.

Hosted database privilege checks: authenticated users cannot SELECT private provider account mappings or execute the payment finalization RPC. The restricted server gateway can execute the fixed RPC. Production database was not migrated for this integration.

Thirty targeted tests pass (Stripe, buyer-sales, pricing/payment and marketplace foundation). These use official SDK signature verification, mocked provider API responses and PGlite database fixtures. They are not actual Stripe payments, bank payouts, hosted Postgres concurrency tests or Safari E2E. Production build and TypeScript pass. The existing full security suite has previously reported seven baseline failures; this change does not claim a clean full suite.

## Connection steps still required

1. Review and authorize test credential storage in the branch-scoped Vercel preview of `lresale`. Never paste keys into chat, commit them, or configure them in production. Use `config/stripe-test.env.example` as the variable inventory.
2. Register a sandbox Stripe webhook for the stable preview URL at `/api/payments/test-webhook`. Pin the endpoint version to `2026-09-30.endive`. Select `checkout.session.completed` and `checkout.session.async_payment_succeeded`; financial events can also be ingested for manual review. Save its signing secret only in preview server environment.
3. Resolve webhook access through deployment protection using a supported, narrowly scoped setup. Do not disable the entire preview's protection: synthetic identities are freely switchable by design. A protected endpoint inaccessible to Stripe is not connected.
4. After verifying the sandbox platform account and environment, enable `private.stripe_test_connection` and the existing private buyer-payment connection only in this isolated database. Existing payment acceptance requires both gates. No production gate changes.
5. Configure an authenticated durable scheduler to GET `/api/cron/stripe-test-events` every minute with `Authorization: Bearer <CRON_SECRET>`. Vercel preview cron execution is not assumed. Without a scheduler, receipts remain pending. Do not put secrets in query strings or logs.
6. Create a synthetic managed order through the existing reservation flow, with explicit test shipping and tax amounts. Never fill unknown real tax amounts with zero. The sandbox reservation is 35 minutes because Checkout requires at least 30 minutes; production reservation settings are unchanged.
7. Run actual sandbox Checkout, webhook delivery and worker processing. Confirm the existing order, stock reservation, payment attempt, seller credit and ledger update exactly once. Replay the event, restart the worker and test late payment/refund review. Onboarding return alone is not proof that a seller can receive funds.

## State transitions and permissions

| Object | Transition | Authority / evidence | Effect |
| --- | --- | --- | --- |
| Attempt | created → pending | Owner begins eligible managed order; trusted server binds returned test session | Stable idempotency key; no credit |
| Inbox | received → leased | Service worker, SKIP LOCKED | Exclusive lease, increment attempt count |
| Payment/order | pending → confirmed | Retrieved Stripe session and succeeded intent, matching snapshots, existing verified RPC | Existing inventory and financial effects once |
| Inbox | leased → retry | Provider retrieval failure | Backoff; no payment state change |
| Inbox | leased → review | Mismatch, late payment, failed business transition, unknown financial event or exhausted retries | Manual reconciliation; no fabricated success |
| Seller mapping | unbound → bound | Trusted server, matching owner and stable request UUID | Private provider account association; no payout eligibility claim |

## Failure handling

- **Checkout timeout:** retry the same order/attempt within its validity, using its stable idempotency key. Query provider before creating replacements. Expired ambiguous attempts require review.
- **Webhook failure:** check signature, endpoint account/version, deployment access and receipt persistence. Stripe retry/replay must not create another credit. Do not mark an order paid manually from a screenshot or redirect.
- **Worker failure:** expired leases can be reclaimed. Review `payment_webhook_events` where provider is `stripe_test` and `review_reason` is non-null. Inspect `processing_attempts`, `next_attempt_at` and `last_error_code`; never clear a processed receipt to force replay.
- **Late successful payment:** compare actual provider charge and stock allocation. Do not reassign sold inventory. Refund requires an explicit idempotent refund operation and a matching ledger correction; the SDK transport helper does not implement that financial workflow.
- **Account creation timeout:** retry the stable request within 23 hours. Older unbound requests stop for provider reconciliation to avoid recreating an account after Stripe idempotency retention.
- **Refund/transfer/payout events:** held for financial reconciliation. A transfer is not a successful bank payout. No automatic release is implemented here.

## Remaining commercial work

Direct marketplace order snapshots and financial allocation, fees and tax decisions, disputes/holds versus release concurrency, partial refunds, transfer reversals, chargebacks, connected-account eligibility refresh, bank payout reconciliation, provider hold limits, durable schedule verification, and real shipping/PDF/QR contracts remain launch blockers. The 15% / CAD1.50 proposal is not enabled commercially. Refund transport alone is not a refund ledger implementation.

No real Stripe API payment, bank payout or carrier QR was exercised by these tests. The dashboard's auto-generated demo account/payment is not a SHIKIMOMO order test.

## Rollout and rollback

Keep the PR and preview isolated until actual sandbox evidence is reviewed. Production launch is a separate decision after the remaining gates and provider requirements are satisfied.

For this sandbox only, disable new test Checkout by setting `STRIPE_TEST_ENABLED=false`; this disables all sandbox endpoints, including receipt and worker processing. During an active test incident, prefer blocking new session/onboarding requests at the preview access layer while leaving receipt/worker processing available until provider events reconcile. Do not delete attempts, webhook receipts, accounts or ledger history. Production rollback must preserve existing order processing and financial records; do not drop these schema additions as a rollback method.
