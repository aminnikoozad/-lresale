# Pre-payment security review — SHIKIMOMO — 2026-10-22

Scope: the current main-site release `0b3ec32784e618abeca09a3f03808c14847f548a`, direct listings, private image evidence, moderation, consent, public APIs and the existing payment boundary. This is a targeted engineering review, not a complete penetration test or payment-launch certification. No real customer, staff MFA, financial provider or Safari session was exercised.

## Finding corrected

**Medium — upload resource limits ran too late.** The photo route relied on Content-Length before parsing multipart; registration enforced asset quotas after image decoding and object upload. Missing/understated Content-Length, invalid image retries and quota-failing uploads could consume processing/storage without consuming an attempt budget.

The fix counts actual streamed bytes before JSON/multipart parsing, including chunked requests; caps photo request bodies at 3.5 MB, community JSON at 16 KB, evidence JSON at 4 KB and delete JSON at 1 KB. The image itself remains limited to 3 MB and processed output to 1.5 MB. A durable owner-scoped database budget now runs before decoding/provider calls: 80 attempts/hour, with every retry counted. An owner advisory lock serializes budget checks; owned draft/version, active-order and 20-photo checks apply first. Supporting indexes avoid full audit/owner scans. Rate denial is HTTP 429; oversize is HTTP 413. Private mutation/error responses use no-store.

A failed external upload/registration can still leave a private orphan object, especially under concurrency. The preflight bounds abuse but does not replace a durable reconciler/cleanup job. Do not delete ambiguous objects automatically: registration may have succeeded after a timeout.

## Confirmed controls

| Area | Evidence | Result |
| --- | --- | --- |
| Inventory and finance writes | Live Supabase grant checks | Authenticated clients cannot INSERT/UPDATE inventory, evidence or wallet rows directly. |
| Private tables | Live catalog/ACL inspection | No anon/authenticated raw grants on private marketplace tables; consent snapshots/receipts inaccessible directly. |
| Image registration | Live RPC grant checks | Service-only; anon/authenticated cannot register processed evidence. |
| Owner/mode/version | Existing database tests plus new preflight tests | Other-owner and stale-version requests rejected; mode/owner and managed prices guarded. |
| Staff review | Database tests; production function source | Capability, MFA, reason and current listing version required. Photos accessible to the owner or authorized MFA staff with a current review record. |
| Consent | Database tests; live schema/config | Explicit per-listing current-version acceptance; immutable receipts; legacy bypass rejected; no commercial/financial consent inferred. |
| Storage | Live bucket/policy inspection | Dedicated bucket private; no browser Storage policies; private endpoints authorize asset access. A real browser upload/PUT/GET remains unverified. |
| API boundary | Targeted live HTTP requests | Cross-origin mutation 403; anonymous community/photo POST 401; unknown private photo 404; nosniff/CSP present. |
| Payment boundary | Live config, HTTP and RPC ACL checks | Provider null/disabled; fake webhook POST returns 503; accept_verified_buyer_payment and record_verified_buyer_refund service-only. Browser return pages cannot prove payment. |
| Secrets | Source/config review | Service role stays server-side; generated/env files ignored; no new secret exposed or rotated. |
| Dependencies | npm audit --omit=dev | No known runtime dependency advisories reported at review time. |

## Required before enabling real payments

1. Implement and test the selected Canadian marketplace provider, seller onboarding, provider-account ownership checks, actual hold/release controls, liability and payout limits. Adapter is currently null; connecting a key does not implement this.
2. Persist a verified webhook inbox before effects; verify raw-body signature, event/account/order/amount/CAD and provider state. Test replays, out-of-order delivery, provider success followed by timeout, and duplicate clicks.
3. Make late successful payments durably reviewable/refundable. The existing SQL payment function rejects expired checkout/reservation states and rolls back its in-transaction event on an exception. The future ingress must retain the event and reconcile it; do not rely on this exception as a complete late-payment workflow.
4. Implement direct-seller pending/releasable/transfer/bank-payout states in the existing ledger. The existing paid-order wallet-credit logic is managed-service logic, not a direct-seller delivery/dispute hold. Test atomic dispute-versus-release, refund after transfer, partial cent allocation, chargeback plus refund, payout retry and reconciliation.
5. Run real authenticated Supabase permission/E2E tests and iPhone/Safari checks. Current fixture tests and live grant probes do not substitute for those. Complete the three end-to-end sale/refund/managed-flow acceptance scenarios in provider sandbox.
6. Complete shipping/QR/tracking, delivery and return/dispute operations, final transaction terms/tax/economics and operational monitoring before enabling public direct transactions.

## Other observed limits

Supabase reports pre-existing leaked-password protection disabled; review the available plan/auth setting before introducing live financial accounts. Advisors flag private tables with RLS/no policies and deliberately exposed SECURITY DEFINER RPCs: these are intentional RPC-only boundaries, checked for explicit grants/identity/capabilities here, not automatically removed. The existing CSP allows inline scripts; nonce-based CSP is a further defense, not a finding of demonstrated script injection. No raw HTML rendering was found in the reviewed marketplace message/profile components.

Full suite retains the seven pre-existing navigation/profile-source/support/language/hero failures. They are not suppressed. UI layout and financial activation flags are outside this hardening change.

## Deployment and rollback

Apply `20261022131358_marketplace_upload_preflight.sql` before deploying the route change. The migration adds an RPC and indexes only; it does not rewrite inventory, consent, orders or money. Keep request-byte and authorization checks when rolling back. Disable new photo upload via the existing media flag if the provider is unstable; retain private images, receipts, attempts and financial history. Do not enable purchases as part of this audit.

## Recorded validation

38 marketplace/photo/policy/request-limit checks pass, including six new chunked-body, UTF-8, multipart, owner/version, retry-budget and full-gallery checks. Full security suite: 211 tests, 204 pass and the same seven pre-existing failures. TypeScript, targeted ESLint and a Node 22 production build pass. Runtime dependency audit reported 0 known advisories. The new migration was applied to isolated Neon staging and then the confirmed production Supabase project. It changes only the upload preflight RPC and supporting indexes. Public live checks confirmed webhook 503, cross-origin mutation 403 and private missing photo 404 with no-store/nosniff/CSP. Real authenticated customer upload, staff session and provider transaction tests remain outstanding.

Leaked-password setting remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
