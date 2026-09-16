-- Public storefront data is exposed through explicitly granted RPCs, not direct table access.
-- There are no RLS policies for the anon role on public tables, so direct anon
-- table privileges are unnecessary and only increase attack surface.
revoke all privileges on all tables in schema public from anon;

-- Keep future tables closed to anon unless a migration explicitly grants access.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
