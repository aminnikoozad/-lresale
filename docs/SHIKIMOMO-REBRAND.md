# Shikimomo branding release

Based on origin/main f819f77. Does not include the isolated QA branch f0bea3da98ef2b08ab5d8c015f19adbb3a1d10a6 or the separate voice-shopping branch.

Visible branding, accessibility labels, support response source, metadata, a web manifest, seller guide links, sitemap and canonical public origin use Shikimomo / https://shikimomo.com. The legacy seller-guide URL permanently redirects to /sell-with-shikimomo. Legacy public URL/name environment values are normalized for display; no environment settings are changed.

## Intentionally retained identifiers

- Package name/lockfile, cart and recovery storage keys, CSS animation names, RPC names, database fields and item/customer codes remain unchanged to protect compatibility and existing sessions/data.
- Historical migrations, schema history, audits and test fixtures remain intact.
- Existing favicon is an abstract symbol with no REWEAR text; unchanged.
- Existing enrolled MFA factors retain their names; newly enrolled factors show Shikimomo.
- Auth redirect fallback and Supabase function CORS origins remain unchanged pending explicit approval of security-sensitive origin changes.

## Separate configuration follow-up

Before relying on sign-up, recovery or cross-origin support from the new domain, review Supabase Auth Site URL and allowed redirect URLs for https://shikimomo.com (including /auth/callback and password recovery routes used by the application); preserve required existing callbacks. Review allowed origins for support-ai, support-trainer, admin-item-photo-upload and admin-mfa-cleanup. Change only after action-time approval.

There are no tracked outbound email templates or sender display-name settings on main. In Supabase/custom SMTP/provider configuration, change sender display name and email template branding to Shikimomo while retaining the verified sender address until a Shikimomo sending domain is authenticated. Verify SPF/DKIM/DMARC and mailboxes before changing sender/support/privacy addresses; do not invent new addresses. Runtime configuration is not changed by this PR.

Stored approved support knowledge and historical notifications may still contain REWEAR. Review current knowledge through its normal approval flow; do not rewrite historical migrations/messages. Support edge-function source copy changes require the existing separate function deployment workflow.

No DNS changes, payment changes, migrations, credentials, live support data, auth settings or unrelated application behavior are part of this release.

## Approved domain configuration — 2026-10-15

After explicit action-time approval, Supabase Site URL is https://shikimomo.com and its exact /auth/callback is added alongside the existing https://lresale.vercel.app/auth/callback. The same callback handles recovery with next=/update-password. Vercel production NEXT_PUBLIC_SITE_URL is https://shikimomo.com.

The four existing edge functions add exactly https://shikimomo.com to their allowed-origin Set without replacing ALLOWED_APP_ORIGINS, legacy defaults, JWT verification or authorization logic. Live preflights pass with 200 for the new origin and reject an unrelated origin with 403. The prior domain still passes for support-ai, support-trainer and admin-mfa-cleanup. Photo upload rejected the prior origin before and after this change; this existing behavior is not broadened by this release. Deployed source is preserved, including any nonfunctional comment differences from the repository.

Email SMTP/sender configuration remains unchanged and custom SMTP is disabled.
