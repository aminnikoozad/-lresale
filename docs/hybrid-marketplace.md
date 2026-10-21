# SHIKIMOMO hybrid marketplace — P0 evidence and P1 review

Verified 2026-10-20. Base: `main` at `d6401cc041f556481bf56df1b66f5cad1d80d726`.
Review branch: `feat/hybrid-marketplace-foundation`. This is **not a completed marketplace or a production launch**.

## Environment and integration requirements

Use a separate staging database. Do not infer readiness from source files or configured credentials. This change does not modify production infrastructure or enable marketplace payments.

Preview builds require explicit paired public Supabase environment settings and reject a production fallback. See `marketplace-staging.env.example`. Server-only credentials must refer to the same staging project. Never copy production service credentials into a preview.

Before applying this migration, compare the target database schema, triggers and migration history with main. Existing managed workflows must be tested in the intended environment. Local PostgreSQL fixtures do not establish hosted Auth, Storage or PostgREST compatibility.

Dependencies still requiring acceptance: an isolated hosted database, marketplace payment/onboarding account, carrier initial-shipment QR capability, and final business/legal/tax policies. Domain verification alone does not establish recipient delivery. A code adapter alone does not establish a live carrier or payment integration.

## What is implemented

- Additive migration `20261020184751_hybrid_sale_mode_foundation.sql`; created using Supabase CLI migration-new. It extends existing `items` rather than making parallel inventory or a second ledger.
- `sale_mode`: `managed_consignment` (existing/default) or `peer_to_peer`; separate `physical_custody` and `shipping_responsibility`; immutable economic owner `owner_id`; optimistic `listing_version`.
- Direct drafts use the existing non-public `listing_preparation` status, with seller custody/shipping and no Bag, physical inspection or managed commission lock.
- Owner-authenticated RPCs use explicit field allowlists and a bounded private projection. Users cannot supply owner, mode, financial state, photo URLs or inspection claims. Existing browser INSERT/UPDATE grants are not expanded.
- A row trigger denies mode/owner changes and disallows direct publication, sale/financial attestation and legacy managed approval. Existing commission and inspection functions remain intact.
- Managed warehouse-sync trigger runs only for managed inventory; a second guard rejects enrollment of direct inventory in `item_operations`. Existing markdown/expiry jobs therefore cannot acquire direct drafts through that table.
- Existing configuration version registry receives an explicitly unapproved proposal (15%, minimum 150 cents per seller suborder; minimum direct price 800 cents; proposed deadlines). No commercial activation or payment path reads/enables this proposal.
- Pure integer-cent fee calculation and CAD parser. The fee helper is not an active checkout/ledger integration. Shipping/taxes and unknown costs are not presumed zero.
- `/sell`: real EN/FR comparison route, linked from the storefront selling CTA; preserves the current managed guide and fees.
- `/account/seller/direct`: authenticated private draft creation/editing with optimistic conflict handling, unknown/unbranded/other brand, size-system and missing-label declaration. Wired to the existing Supabase client and new RPCs, with an unavailable message if the migration is absent. It is **not** the full photo/shipping/moderation listing wizard.
- Seller navigation includes the direct-draft destination. No existing customer accounts, inventory or financial histories were replaced.

## Data and permission map

| Resource | Owner | Other customers / anon | Staff / services |
| --- | --- | --- | --- |
| Existing `items` | Existing own-row SELECT policy; new RPCs only edit own direct drafts | Existing RLS; no new raw grants | Existing managed permissions preserved; direct editing requires economic owner |
| `my_marketplace_drafts()` | Own direct draft fields only, max 200 | No other-user selector; anon EXECUTE revoked | No cross-user staff shortcut |
| `save_marketplace_draft()` | Own draft with expected version; new drafts capped at 200 | Denied | No managed-price or financial override |
| `item_operations` | Existing read rules | No new grants | Only managed items may be enrolled |
| `business_setting_versions` | No new access | No new access | Existing rules; proposal only |
| Existing financial tables | Unchanged | Unchanged | No new payout/refund capability |

Public storefront seller identity and private shipping addresses are intentionally not implemented by exposing profiles or `SELECT *` from items. Those projections require separate P2/P3 work.

## Implemented transition table

| Transition | Actor / preconditions | Database effect | Money / side effects |
| --- | --- | --- | --- |
| New direct draft | Non-anonymous authenticated owner, validated allowlisted data, below draft cap | Insert existing inventory, seller custody/shipping, private status, listing version, audit event | None; no provider, warehouse job or email |
| Edit direct draft | Same owner, matching version, no reservation/order, still draft | Replace validated fields; content change increments version; audit event | None |
| Change sale mode / economic owner | No transition available in P1 | Rejected | None |
| Direct publication / sale / team inspection claim | No transition available in P1 | Rejected even through legacy mutation paths | None |
| Managed inspection / pricing / publication | Existing capabilities, MFA, mandate/inspection/evidence controls | Existing functions and locks | Existing behavior, unchanged by this migration |

The original P1 foundation did not include lifecycle actions. The follow-up below adds private archive, restore, copy and sold-elsewhere declarations. Conversion, dispute, refund, transfer and payout remain unimplemented.

## Verification evidence

- New focused tests: **7 passed**, 0 failed. Real SQL runs in isolated PGlite PostgreSQL with auth/role fixtures, RLS/GRANT and the existing commission, inspection, evidence and warehouse-sync functions. Covers cross-user reads/writes, anonymous denial, payload forgery, stale versions, reservation lock, prohibited mode/owner/inspection/financial mutation and managed publication with evidence.
- These are local PostgreSQL fixture tests, **not** real Supabase Auth/Storage/PostgREST tests, concurrent multi-connection E2E or provider acceptance.
- Production Next.js build succeeded on Node 22.23.3; TypeScript check passed. ESLint: 0 errors, one pre-existing `<img>` warning in managed seller item tracking.
- Complete security command on Node 22: **160 tests, 153 passed, 7 failed**. All seven failures reproduced on the untouched main worktree using the same failing files: two account-workspace assertions, guest-support copy, the site-language test module, old storefront-hero expectations and two support-page assertions. They are not reported as passing or silently removed. No new failure was observed.
- HTTP smoke of the built `/sell` route: EN and FR both returned 200 with the correct selected language. This is not a browser test.
- Cloud Browser could not reach the isolated local server (`ERR_CONNECTION_REFUSED`). No desktop screenshot, iPhone Safari acceptance, signed-in draft E2E, test customer account or public hosted preview is claimed.
- None of the three mandatory transaction scenarios (direct through test payout; bundle/dispute/partial refund; complete managed Bag-through-settlement) has been completed. The full 36-case acceptance suite remains a launch gate.

## Next work and decisions

1. Provide an existing separate Supabase staging project, or explicitly choose a paid plan after its actual price is shown. Reconcile migration drift, apply the foundation there, run advisors and authenticated API/Storage tests before any promotion. No secret should be pasted into chat.
2. Confirm a marketplace-capable test account/provider and Canadian onboarding capabilities. Ordinary checkout is insufficient. Candidate architecture: platform charge followed by separately controlled transfers; actual contract, maximum hold time, account responsibility, negative balances, refunds/chargebacks and payout schedule remain unapproved. [Stripe charge types](https://docs.stripe.com/connect/charges). No Stripe adapter is installed by this branch.
3. Validate Canada Post initial-shipment QR for the actual account/API and chosen services. Preserve a single shipment/reference for PDF and genuine carrier QR. No fabricated internal QR or return-only QR substitution.
4. Continue P2: secure processed seller photos, onboarding/terms, public seller projection, catalog badges/filters, moderation, structured offers/messages, single-seller bundles. Do not relax managed inspection to publish direct listings.
5. Continue P3–P6: inventory/quote locks and snapshots, provider-signed webhook inbox/outbox, financial ledger extension and reconciliation, seller-origin shipping/tracking, disputes/returns, concurrency-safe release, notifications/admin queues and full E2E.
6. Commercial launch needs final fees/deadlines, taxes/legal role and Québec/Canada policy review, and a costed low-price/bundle economics model. No unknown expense or tax rate is assumed to be zero; no commercial decision was made here.

## Deployment, recovery and rollback

This change is for isolated branch review. It does not enable direct purchases, transfer funds, purchase postage or alter financial history.

For staging: back up schema, reconcile actual migration history, apply only to the separate project, configure paired public env values, use synthetic data/accounts, run SQL/advisors/API and browser acceptance, then create a preview. Never deploy a preview pointed at production to work around unavailable staging.

For production later: require the tested exact commit, separately approved production migration/release and all launch gates. Keep direct publication/payment closed until commissioned. The application is safe to run without the new RPCs: direct drafts show unavailable, while the managed route remains reachable.

For rollback: revert the application commit or disable new entry points; keep additive columns, audit/config versions and all historical data. Do not drop inventory, order or ledger tables or erase audit history. No active marketplace order exists from this branch. Before enabling actual marketplace orders, rollback must preserve servicing of existing orders, disputes, refunds and reconciliation while disabling new checkout.

Financial/shipping incident handling is a **future launch gate**, not an implemented runbook: ambiguous provider outcomes must be reconciled by their idempotency reference before retry; refund and transfer reversal are separate; failed payout must not create another credit; label creation is not carrier acceptance; pickup-at-post-office is not delivery. Existing managed label incident instructions remain in [Canada Post label operations](canada-post-labels.md).

## Neon SQL rehearsal preview

When an independent Supabase environment is unavailable, this branch supports an explicitly limited Neon rehearsal at `/staging`. It is **not a replacement for hosted Supabase Auth/Storage acceptance**.

The database contains schema definitions from the intended application, plus an explicitly simulated `auth` claim context and synthetic seller identities. No customer records, passwords, provider secrets, production scheduled jobs or production uploads are copied. Outbound dispatcher functions are disabled and notification dispatch triggers are not installed. Non-constraint performance indexes are not part of this rehearsal snapshot.

The preview uses the same `DirectDraftEditor` component and the actual draft RPCs. Testers can switch between two synthetic sellers and verify draft isolation. It does not allow publishing, payment, postage purchase, financial release or arbitrary SQL. Production deployment always rejects this mode. Requests outside the rehearsal/comparison pages are redirected; application APIs are disabled. Supabase clients receive a deliberately unusable origin, never a production fallback.

Preview variables must be scoped only to this review branch:

- `SHIKIMOMO_NEON_STAGING=true`
- `NEXT_PUBLIC_APP_ENV=staging`
- `NEXT_PUBLIC_STAGING_BACKEND=neon`
- `SHIKIMOMO_STAGING_DATABASE_URL`: server-only Secret; use a SQL-created restricted gateway role, not an API-created administrative Neon role. The URI must name the rehearsal database and a Neon host. A database marker is asserted before every operation, then the transaction switches to the authenticated role and supplies a synthetic identity context.

Keep existing Vercel preview authentication enabled. Do not put real data into this environment. This test portal deliberately simulates identities; changing the selected seller is not a sign-in test.

Hosted PostgreSQL checks passed for draft creation, own visibility, denial of cross-seller edits, stale versions, unsupported mode payload, raw writes, anonymous RPC access, premature publication, owner conversion and warehouse enrollment. Browser acceptance is reported separately from these SQL checks. Full production parity, real sign-in/Storage, providers and the transaction scenarios above remain required.

## Follow-up: private listing lifecycle (2026-10-20, Montréal)

The user selected Neon for continued staging work. The migration `20261021014818_marketplace_draft_lifecycle.sql` extends the existing inventory and audit log; it creates no parallel inventory, order or financial ledger.

| Action | Requirements | Result | Financial effect |
| --- | --- | --- | --- |
| Archive | Owner, editable direct draft, current version, no active reservation or order history | Existing item becomes archived with a closure reason; version increments | None |
| Restore | Owner, archived unsold draft, current version, capacity below 200 active drafts, no reservation/order history | Same item returns to private draft; version increments | None |
| Copy | Owner, current version, private/archived direct item, no reservation/order history | New independent private inventory ID with descriptive fields and measured dimensions | None; photos, evidence, inspection, commissions and transaction history are not copied |
| Declare sold elsewhere | Owner, editable direct draft, current version, no reservation/order history | Archived with `sold_elsewhere`; same item cannot be restored | No order, payment, seller credit, earnings or verified-sale count |

Actions authenticate in the server handler and again in the RPC. They serialize on the seller and lock the item row. A request UUID recorded in the existing audit event makes retries of the same action return the same result; reuse for another item/action is denied. Archiving/restoring invalidates stale edit forms. The current conservative lock includes any order history, even cancelled orders. No new table write grants or staff shortcuts were added.

Both the real-account route and synthetic rehearsal use the shared editor/list. Category-specific clothing types reuse the existing catalog taxonomy and EN/FR translations. Optional centimetre measurements are preserved, validated in both server parsing and SQL, and never inferred. Blank measurements remain unknown. Private projection returns up to 400 rows, prioritizing the active drafts; older archives require future pagination.

Verification completed before preview publication:

- 14/14 focused PostgreSQL and helper tests pass, covering the lifecycle, request replay/misuse, ownership, stale versions, reservation/order locks, restore capacity, descriptions-only copies, measured values and managed inspection/publication regression.
- TypeScript/preview build and targeted lint passed. The known baseline full-suite failures described above are not claimed fixed.
- Migration applied only to the isolated synthetic Neon database. Hosted archive/restore/copy/sold-elsewhere assertions passed. Two concurrently issued copy transactions using the same request returned the same new inventory ID. Cross-seller access and anonymous execution were denied. Orders and wallet transactions remained zero.
- An initial hosted check rejected a clothing type that was valid only in another category. The form was corrected to reuse the actual taxonomy, and the local fixture now includes that real database constraint. The constraint was preserved.

Browser acceptance for this follow-up is recorded in the PR after exercising the deployed exact commit. This remains a SQL rehearsal with simulated identities: no real authentication, upload processing, provider payments/payouts, carrier label/QR or complete sale is claimed. Rollback reverts the UI/actions while retaining the additive closure column, audit history and inventory; production is untouched.

## Account selling choice and seller photo evidence

The follow-up account integration, private image pipeline, disclosure rules, provenance badges, actual test boundaries and blocked hosting-secret transfer are documented in [Direct listing policy and implementation](direct-listing-policy.md). Managed Bag/pickup remains the existing flow; direct photo evidence never substitutes for team inspection. The storage adapter is currently disabled in the preview pending explicit credential-transfer authorization.

## Community trading follow-up

See [current implementation, acceptance and remaining gates](marketplace-community.md). This report supersedes earlier readiness counts for the community increment. It does not authorize production or claim the complete marketplace experience.
