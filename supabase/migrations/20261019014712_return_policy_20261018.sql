-- New checkouts must accept the published 7-day returns policy. Historical orders retain their accepted version.
update private.checkout_policy_versions set return_policy_version='2026-10-18',updated_at=now() where singleton;
