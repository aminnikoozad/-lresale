# Shikimomo launch operations — 2026-10-15

Scope: standard store. Google indexing is complete per the owner. Smart Shopping remains Coming soon pending owner-hosted infrastructure. Payment-provider integration remains a separate release.

## Changes prepared

- Production CRON_SECRET configured as a server-only sensitive Vercel value. The next deployment receives it. Verify the existing expiry endpoint after deployment; a configured secret alone does not prove the database RPC is installed.
- Correct the admin selling-rules text: below the free-pickup threshold, one flat fee applies to the collection, not a fee per item.
- Replace the obsolete cloud AI-support readiness requirement with the deferred owner-hosted Smart Shopping status and actionable store-operations checks.
- Add explicit one-time account-level team-pricing authorization. New collection requests require this consent after the database migration is installed. Persist its exact version on the request.
- An MFA item manager may finalize prices only after consent, physical inspection, and a current-price concurrency check. Freeze the initial price, commission percentage, rule version and tier. Notify the seller in their account. Item publication remains an explicit staff action with existing photo/inspection gates. Bundles require inspected items belonging to the same seller.
- Existing locked prices/commissions are unchanged. `seller_pricing_approved_at` is retained as the legacy commission-lock column; `pricing_authority` explicitly distinguishes seller approval from team finalization. Team finalization never represents a seller approving a particular price.
- Website controls depend on the new RPCs; if they are unavailable, hide the new controls and preserve the existing approval workflow. Do not describe the database change as live until installed and verified.

## Database installation is blocked

The Supabase connector returns `You do not have permission to perform this action` even for list_migrations. No alternate database credential was used to bypass that refusal.

After authorized access is restored:

1. Verify the intended project is `lsdhobwrnmlkqnvkamlt` and inspect its migration history.
2. Apply any missing prerequisite migrations in order, then `supabase/migrations/20261015175400_team_managed_pricing.sql`.
3. Run database advisors; verify RLS/grants, MFA, account ownership, mandate version and immutable commissions in an isolated test environment.
4. Test a seller accepting the mandate once, submitting a collection request, staff recording a real inspection, finalizing pricing and explicitly publishing an item with photos. Check the seller's account notification and commission.
5. Confirm old locked items remain unchanged, pricing cannot be finalized without the mandate or MFA, and stale-price submissions fail.
6. Test bundle finalization with two inspected, same-owner items. Missing inspection or mixed ownership must fail.

## Information / operational access still required

- Public support email, phone, business address, privacy contact and support hours (EN/FR). Confirm the mailbox really receives messages before publishing it.
- Supabase Auth configuration access for SMTP delivery, confirmation/recovery redirects on shikimomo.com, CAPTCHA provider and leaked-password setting. Never disable protection to work around missing configuration.
- Canada Post production account credentials entered securely, verified origin and packed-parcel data if national shipping is offered. Local-only launch is a separate owner decision.
- Return window, return destination, refund authority, seller payout method and release timing. Do not invent these or turn pending wallet credits into payouts.
- Tax registration/status and final server-side tax/total implementation before the payment release. No live payment provider is connected here.

## Verification boundaries

Local database tests prove permission and state behavior in fixtures; they do not apply migrations remotely. A site response or build does not prove authenticated operational flows, mailbox delivery, carrier rates, seller payouts or payment processing.

## Production verification result

- Release `4eb92d46d54491307ea570ac5f775f917cea3be8` reached READY on shikimomo.com.
- Unauthenticated expiry request returned 401 as required. Authorized expiry returned 503; runtime logs reported `Invalid API key`. This is not a successful cleanup run.
- The public `NEXT_PUBLIC_SUPABASE_URL` in Vercel points to `qisvbuqppovaemfmiujr`, whereas the established storefront project is `lsdhobwrnmlkqnvkamlt`. No database was switched and no private key was read or reused to bypass denied administrative access.
- Align server-only keys and URL configuration with the established storefront project, redeploy, then verify an authorized expiry request returns 200. Restore Supabase management access before applying the prepared pricing migration.
- Public home, shop, support, account entry, seller terms and guide returned 200 after release; admin readiness redirected unauthenticated access to the restricted login.
- Add an explicit project-consistency check for server storage/cleanup and display the mismatch in admin readiness. Key presence alone must not mark a mismatched configuration ready.
