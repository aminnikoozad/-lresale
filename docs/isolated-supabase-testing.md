# Isolated Supabase testing

The unchanged default configuration connects to the existing production project. A localhost app, a Vercel preview, or `NODE_ENV=test` alone does **not** isolate data. Never run a write-oriented lifecycle test against those defaults.

## Explicit build configuration

For an approved, separate hosted Supabase test project, set all three values in the intended environment **before** `next build` (or before starting `next dev`):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<test-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<test-project-publishable-key>
NEXT_PUBLIC_SUPABASE_TEST_ISOLATION=true
```

Use the target project's `sb_publishable_...` key. These values are browser-public; never put a secret/service-role key or other credential in a `NEXT_PUBLIC_` variable. Legacy JWT keys are deliberately unsupported for these overrides.

- With no overrides and isolation omitted or `false`, existing production behavior remains available.
- Any URL/key override must be complete and nonempty. Invalid configuration throws instead of combining an override with a production default.
- Isolation `true` requires both overrides and refuses the known production URL or publishable key. It accepts only canonical, nonproduction `https://<20-character-project-ref>.supabase.co` origins, not custom domains, proxies, or local/self-hosted endpoints. Misspelled flag values fail closed.
- Browser, SSR, public reads, password recovery, storage-image policy, and isolated CSP all resolve the same project. Next configuration validation also runs before build/server startup. In isolation mode, browser Supabase connections and storage images are restricted to the selected origin.

Next.js replaces literal `process.env.NEXT_PUBLIC_*` references at build time. Changing variables only at runtime, or promoting a previously built production artifact to a test deployment, does not switch its bundled clients. Rebuild for the target environment and keep its build and runtime public settings identical. Restart the development server after changes. See [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables) and [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Before live lifecycle tests

This guard prevents accidental fallback to the known production project; it does not provision a test project or prove another project is disposable. Independently verify the exact project reference and deployment before allowing any writes.

1. Obtain approval for the separate environment. Apply and verify migrations there, including permissions, RLS, Storage and Edge Functions. Use synthetic accounts/data only; do not copy production customer data.
2. Configure test Auth Site URL/redirects and email delivery separately. Test signup, email verification and password recovery against that test project.
3. Do not inherit production server secrets, SMTP/carrier/payment credentials, cron secrets or external-service destinations. Public URL isolation does not isolate those systems. In isolation mode, the app refuses to create its privileged `postalStorage()` client **before reading either** `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. Postal readiness is unavailable, blocking live carrier calls through the quote endpoint as well. There is deliberately no environment flag that bypasses this guard.
4. Build with all three test variables, then verify the browser Network panel's API/Auth/Storage destinations and the deployment's server-side target. For automated browser tests, also block production origins in the test runner. Do not consider a preview URL proof of isolation.
5. Only after those checks, run the authorized synthetic lifecycle and verify cleanup.

### Coverage intentionally blocked

Isolated app tests cannot exercise postal quote persistence/live carrier quoting or the `/api/cron/expire-checkouts` service-role job. Those workflows remain unavailable until a separate, authorized implementation can verify the server key belongs to the isolated project. Merely setting a server key or turning isolation off is not a safe way to enable test coverage.

The four Edge Functions (`admin-item-photo-upload`, `admin-mfa-cleanup`, `support-ai`, `support-trainer`) independently construct privileged clients using their deployment's Supabase URL and service-role key. The Next.js flag does not configure those remote runtimes. Their live coverage is unverified and must wait for an approved separate project deployment, matching project-runtime credentials, an explicit test-only `ALLOWED_APP_ORIGINS` configuration, test Auth Site URL/redirects, and review of any AI or other outbound-service credentials. The public guard is neither proof of resource isolation nor authorization to deploy or write to any remote project.

## Local regression checks

`node --test tests/supabase-config.test.ts` checks defaults, override validation, production refusal, browser/recovery resolver use, Next image/CSP configuration, and the privileged-client/credential-access guard with synthetic fixtures. It makes no Supabase requests. Existing PGlite database tests are local and likewise do not provision, migrate, or verify a remote project.
