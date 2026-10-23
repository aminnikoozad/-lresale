# Independent production backups to Cloudflare R2

Status: weekly backups enabled. First verified production backup completed on
2026-10-23 at 04:07 UTC in [Actions run 39898577366](https://github.com/aminnikoozad/-lresale/actions/runs/39898577366).
Database archive listing, R2 read-back checksum, authenticated decryption and tar
listing passed. Storage had 2 buckets and 0 objects, confirmed independently by SQL.
The private R2 destination contains the archive and verification marker.
An isolated database/application restore drill has NOT been performed; recovery
is not yet fully tested. No lifecycle expiry or bucket lock is configured.

## Destination and activation

Dedicated private R2 bucket: `shikimomo-backups`. Keep public development URLs,
custom domains, public access and CORS disabled. Never reuse Satpolis credentials.
Use an Object Read & Write S3 credential scoped only to this bucket. The job does
not need bucket administration. Do not put backup credentials in Vercel/client
environment variables, source files, pull requests, logs or workflow artifacts.

Repository Actions secrets:

| Secret | Value |
| --- | --- |
| BACKUP_DATABASE_URL | Production session-pooler port 5432 URL for dedicated shikimomo_backup_reader, with password and TLS |
| BACKUP_SUPABASE_SERVICE_ROLE_KEY | Production server-only key, for reading private Storage objects |
| BACKUP_ENCRYPTION_KEY | 32 cryptographically random bytes, hex encoded |
| R2_BACKUP_ACCESS_KEY_ID | Dedicated bucket-scoped S3 access key |
| R2_BACKUP_SECRET_ACCESS_KEY | Matching S3 secret |

Owner policy: keep keys only in the system's secret store. Do not export recovery
key files or save key values in assistant memory, documents, source, or reports.
The initial exported key was superseded before any backup ran and its file was
removed. Recovery jobs must obtain the current key through the system secret
store; losing that secret makes the encrypted backups unusable. Preserve the
necessary OAuth/SMTP/edge-function configuration inside system secret stores too.

The existing Vercel POSTGRES_URL_NON_POOLING points to a different Supabase project
and must not be used for production backups. A dedicated `shikimomo_backup_reader`
login was provisioned in the actual production project with `pg_read_all_data`,
`BYPASSRLS`, read-only transactions by default and a 30-minute statement timeout.
It has no superuser, role creation, database creation or replication attribute.
Its password is only in the Actions connection secret. This account can read
private/Auth data for backup; it is never exposed to the browser or Data API.

After adding secrets, set repository variable `R2_BACKUP_ENABLED=true` and run
**Independent R2 Backup** manually. Scheduled runs occur at 08:17 UTC every Friday
(04:17 Montréal daylight time / 03:17 standard time). GitHub schedules can be
delayed: this is not continuous replication or automatic failover. Configure the
owner's GitHub Actions failure notifications and monitor missing weekly runs.

## Coverage and retention

The custom-format PostgreSQL 17 archive includes database schemas/data (including
Auth, private tables, functions, RLS and ACL grants) accessible to the connection.
Ownership is intentionally omitted; required custom roles must be recreated and
the repository migrations reconciled in recovery. Custom role passwords,
Supabase platform settings, external provider secrets and deployed function source
are not part of pg_dump. Storage buckets and every enumerated object are captured
separately, with original names, metadata and SHA-256 in the encrypted manifest.

Each full archive has a unique key under `daily/`; old backups are never overwritten
or deleted by the job. A `.verified.json` marker is written ONLY after a complete
download, checksum, authenticated decryption and archive-list check. This verifies
bytes, not successful application restoration. Failed uploads can leave incomplete
unmarked archives; never use one as a verified recovery point.

Storage and the database do not share an atomic snapshot. Reconcile uploads,
deletions and writes made during a run; a failed object download aborts the run.
Full weekly media copies consume storage and Supabase outbound transfer; the R2
free allowance is shared with Satpolis and is not a guarantee of zero charges.

Target retention: 30 days. Do not enable automatic deletion until several backups
and the restore drill are verified. Then explicitly configure lifecycle expiry for
`daily/` after 30 days, with an appropriate shorter bucket lock to protect recent
copies. These retention/lock controls are not installed by this code. Confirm the
retention change before applying deletion rules. Keep the first verified recovery
point until the replacement is proven.

## Recovery drill (isolated environment only)

1. Pick a `.verified.json`, download the referenced encrypted object, and verify
   its SHA-256 against the marker. Supply the encryption key to the recovery job
   through the system secret store; do not export it as a file.
2. With Node 22, use `decryptFile` in `scripts/backup-crypto.mjs` to decode to a
   new temporary file; never extract until authenticated decryption succeeds.
3. Inspect `tar -tzf` first, then extract into an empty private temporary directory.
   Check the SHA-256 of `database.dump` and each object against `manifest.json`.
4. Use PostgreSQL 17 `pg_restore --list database.dump` to inspect the archive.
   Restore into an isolated Supabase test project/local stack. Existing Supabase
   managed schemas/extensions require a reviewed restore list; DO NOT blindly
   restore over production or use `--clean` on production. Recreate required roles
   and permissions using the repository migrations and role inventory.
5. Restore bucket configuration and upload objects via Storage API with the
   original bucket/name/content type; inserting metadata alone does not restore
   actual files. Reconcile Auth identities and platform configuration separately.
6. Verify login, admin authorization/RLS, item counts, sample photos, orders,
   seller earnings and application behavior. Disable real emails, payments,
   webhooks and scheduled operations in the test environment.
7. Record tested backup ID, counts and results. Only after successful testing may
   this be called a tested recovery system. Remove plaintext test copies securely.

References: Supabase database backups and CLI backup/restore documentation;
Cloudflare R2 object lifecycles and bucket locks documentation.
