-- Close legacy public catalog endpoints that are not used by the current storefront.
-- catalog_item_detail also exposes internal inspection fields and should not be
-- callable by public/signed-in clients until a buyer-safe detail contract exists.
revoke execute on function public.catalog_items_v2() from public, anon, authenticated;
revoke execute on function public.catalog_item_detail(uuid) from public, anon, authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Keep future
-- public-schema functions closed unless a migration explicitly grants a caller role.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
