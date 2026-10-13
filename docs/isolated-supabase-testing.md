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
- Isolation `true` requires both overrides and refuses the known production URL or publishable key. Hosted targets must use canonical, nonproduction `https://<20-character-project-ref>.supabase.co` origins. An explicitly approved native test runtime can use only literal `http://127.0.0.1:<port>` or `http://[::1]:<port>` origins on ports 20000–32767. DNS names (including localhost), disguised IP forms, other ports, credentials, paths, queries and fragments remain rejected. Misspelled flag values fail closed.
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

All four Edge Functions independently construct privileged clients from their own runtime configuration. The Next.js flag does not configure them. For approved local testing only, `admin-item-photo-upload` and `admin-mfa-cleanup` accept `REWEAR_LOCAL_TEST_ISOLATION=true` together with exactly `ALLOWED_APP_ORIGINS=http://127.0.0.1:3000` and the literal loopback Supabase endpoint described above. This validates configuration before reading credentials; it does not verify process ownership or grant permission to run tests. Their existing Auth, MFA, role, storage and ownership checks remain active. `support-ai` and `support-trainer` are not enabled by this local exception and require separate review of outbound AI credentials. No local or public guard authorizes remote deployment or production writes.

## Local regression checks

`node --test tests/supabase-config.test.ts` checks defaults, override validation, production refusal, browser/recovery resolver use, Next image/CSP configuration, and the privileged-client/credential-access guard with synthetic fixtures. It makes no Supabase requests. Existing PGlite database tests are local and likewise do not provision, migrate, or verify a remote project.

## Native-runtime verification notes

Use official Supabase service artifacts and real Auth enrollment/verification, PostgREST, Storage and Edge runtimes. SQL-only or fabricated JWT tests do not prove MFA or browser behavior. If the stock CLI cannot run in an executor, report that limitation independently from application failures. Bind all test services to loopback, retain runtime secrets outside the repository, and block external origins in browser QA. A local routing gateway must map only its own publishable key to its own anonymous role; user-session authorization must continue to be verified by the actual services.

For literal HTTP loopback isolation, CSP uses the exact HTTP/WebSocket origin and omits HTTPS-upgrade only for that case. Images are loaded directly by the browser under that exact-origin policy; Next.js private-IP image-fetch protections remain enabled. Next URL normalization is skipped only in that validated loopback mode, so exact-origin callbacks retain 127.0.0.1 instead of being rewritten to localhost. Production HTTPS, hosted URL normalization and hosted CSP behavior are unchanged.

Rejection evidence still requires HTTPS. A local API client may use a test-only, read-only HTTPS proxy after verifying actual stored image bytes, with certificate trust scoped to that client. This does not verify browser TLS, and no browser certificate-warning bypass or system-wide trust change is implied.

Focused offline checks include `tests/supabase-config.test.ts`, `tests/supabase-edge-origins.test.ts`, and `tests/reservation-time.test.ts`. Keep offline, real-service API and browser results separate.
