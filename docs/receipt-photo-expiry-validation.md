# Receipt, photo-reference and expiry guards

## Behavior

- Once collected, a bag may stay collected or advance to inspection/completed. Once under inspection, it may stay there or advance to completed. Pre-receipt, missed and cancellation transitions are blocked at the table trigger for every SQL writer. Existing finalized-state RPC rules remain in force.
- Photo arrays reject null entries, whitespace-only entries and multidimensional arrays. A listed/relisted item must retain at least one nonempty reference. Valid existing URL formats and query strings are preserved. This verifies references only, not uploaded object existence or physical condition.
- Reservation cleanup rejects NULL and out-of-range batch sizes. Service-role authorization and protection for in-progress payments are unchanged.

No existing application rows are rewritten. This additive migration does not replace PR37's separate price/inspection trigger. Both migration orders are compatible. The lockfile includes PR36's dependency patch to keep the standard production audit passing; PR37 application changes are not included.

## Reproduce

Use Node 22. Run `npm ci`, then `npm test`. Focused regressions are `node --test tests/receipt-photo-expiry-db.test.ts`.

The optional deeper harness uses a separately reviewed, schema-only ordered baseline plan, never a production data dump:

`node scripts/test-full-bootstrap-lifecycle.mjs --plan /path/to/reviewed-bootstrap-plan.json --publication-guard /path/to/PR37/20261013010000_clothing_publication_price_guard.sql`

It creates a fresh memory-only PGlite database, replays the baseline, then both candidate migrations. The input plan and logs remain local and are not committed. Do not feed an unreviewed plan: its SQL executes locally. No network connection or hosted database credentials are used by the harness.

The recorded baseline contained 1,351 ordered statements and 71 public RLS-enabled tables. With actual application tables, policies, triggers and RPC bodies, the harness verifies 35 labeled checkpoints covering bag insertion and seller confirmation, staff receipt/inspection, synthetic photo references, owner pricing approval, publication, another-account buyer checkout, repeat-click denial, cross-user RLS, cancellation, inventory release, expiry and the new guards.

## Limits

Auth system tables and JWT helpers are local test doubles, not real sign-in or MFA. PostgreSQL roles/RLS and application RPC bodies execute locally. PGlite serializes requests; competing-request tests do not establish multi-connection transaction/concurrency safety. Hosted Postgres, real Auth/SMTP, Storage upload/download, browser sessions, carrier fulfillment, physical inspection, payment and payout integrations still require isolated hosted verification. No production fixtures or real funds were used.
