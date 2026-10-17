# Workflow security reconciliation — 2026-10-17

Based on main `1d54d47390e4241f381fe0bd7dc22c16f836d65c`. Adapted from draft [PR40](https://github.com/aminnikoozad/-lresale/pull/40), head `26e4601fff39ef1c9b8c963fd5fe901d521417c6`, after read-only comparison with production Supabase definitions. PR40 remains untouched. This patch is independent of PR60/public-policy projection.

## Exact deployment scope

One migration: `20261017140611_workflow_security_reconciliation.sql`, generated with the Supabase CLI and wrapped in a single BEGIN/COMMIT. Its four attributed sections must deploy atomically: never relax the support audit trigger without revoking direct conversation UPDATE in the same transaction.

- Replace return INSERT policy to require `submitted`, preserving buyer/order/item and delivered/paid eligibility. Does not issue refunds or edit existing claims.
- Replace `update_selling_rules` with required JSON number/null/type checks. Preserve permissions, versioning, audit insertion, commission continuity and historical values.
- Replace support audit trigger function to audit already-authorized updates instead of incorrectly requiring staff for customer/service workflows.
- Make disabled support membership override retained AI capability flags in `support_has_permission` and `support_admin_context`; independent AI permissions and existing optional-MFA policy remain intact.
- Cast Auth email to text in support inbox/detail return queries.
- Revoke authenticated table UPDATE and the four legacy column UPDATE grants on support conversations. Retain checked RPC and service-role workflows. Make return-to-AI assignment comparison NULL-safe.
- Replace collection SELECT policy's obsolete `pickup_logistics` role with `logistics` plus explicit pickup capability, retaining existing own-customer/staff reads and MFA conditions. No item-edit permission granted.

No business data rewrite, credentials, feature-gate activation, customer messages, refunds, payments, or production mutation occurred while preparing this patch. Production application changes authorization and requires explicit approval of this exact scope.

## Reconciliation evidence

Token-level comparison of the seven replaced function bodies against current production showed only the intended changes above. None intersects the 43 function bodies introduced/replaced by the nine latest Oct14–16 buyer/team-pricing migrations. Public projection changes no writer, and this patch does not modify the existing/private or new/public selling-rule readers.

The vulnerable return policy allows eligible buyers to submit administrative statuses; this forges a workflow record but does not itself issue money. Disabled support accounts retaining capability flags and raw conversation updates are authorization risks. No exploit was attempted on customer data.

## Tests and limits

Three focused PGlite files cover return status/cross-user eligibility, invalid selling-rule no-write results, support customer/staff/service workflows, inactive capabilities, email result types, raw-update denial, NULL assignment, logistics capability/MFA and an exact full-migration execution smoke test. Identities are explicit test stubs; these tests do not prove genuine Supabase Auth/TOTP, browser, Realtime or live deployment behavior.

Initial focused tests:14/14. Buyer/team compatibility plus focused tests:21/21. Full-artifact support suite after atomic consolidation:9/9. Clean pinned-main full security suite: 133/133 passed, with zero failures, skipped or cancelled tests (Node 22; fresh archive of base commit plus only this patch). Historical PR40 integration claims are not re-certified by this run.
