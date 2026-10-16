# Isolated cloud test environment

This branch adds an explicit test-only Supabase configuration. It does not provision, configure credentials, deploy, or switch production.

## Configuration contract

Set these at **build time** for an isolated test app:

- `NEXT_PUBLIC_SHIKIMOMO_ENV=test`
- `NEXT_PUBLIC_TEST_SUPABASE_URL`: separate Supabase-compatible service URL
- `NEXT_PUBLIC_TEST_SUPABASE_PUBLISHABLE_KEY`: that service's own `sb_publishable_` key

For signup/recovery, also set server-side `TEST_SITE_URL` to the isolated app origin and explicitly allowlist its callback URL on the test auth service. Test auth callbacks reject missing settings and known production origins instead of falling back to production. Verify any custom domain really belongs to the test app; string validation cannot establish backend ownership.

Test mode fails closed if either setting is missing, the production project URL/key is supplied, the URL is unsafe, or a secret key is supplied. Browser, server, public-read and password-recovery clients share this resolver. Without the explicit test mode, production behavior remains unchanged; an ordinary Vercel preview is therefore **not proof of isolation**.

For privileged storage operations, `SUPABASE_URL` must also explicitly match the isolated service. Use only a separately approved test service credential. Never copy production secrets. Review all existing environment variables and integrations before running a deployed test app.

Public keys must be configured before building, because Next.js embeds public variables into browser bundles. Do not reuse a production build artifact for testing.

## Remaining service prerequisites

Neon `rewear-test / test-only` is a PostgreSQL test database, not a full Supabase service. Real authentication, token refresh, password recovery, object storage and Edge Functions require separate compatible services. An `auth.users` fixture table alone does not provide authentication.

Do not enable real email delivery, live carrier requests, payment capture, production cron jobs or production webhooks. Use synthetic test users/items and isolated sandboxes or stubs. Verify target URLs before any write.

## Verification levels

- `npm test` runs synthetic PGlite SQL regressions, source-level regressions, ESLint and Next.js build. It is not browser E2E or verification of deployed migrations.
- New `test-environment.test.ts` cases check fail-closed test configuration and common-client routing.
- Public website navigation is read-only smoke coverage; the live catalog currently has no listed items.
- Full account, seller, inventory and checkout E2E remains pending an isolated running app with the compatible services above.
