-- Prevent future functions created by postgres in public from automatically
-- becoming executable by every role through PostgreSQL's PUBLIC grant.
-- Application-facing RPCs should be granted explicitly in their own migration.

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
