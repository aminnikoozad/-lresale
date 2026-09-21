-- Keep active Home & Decor subcategories publicly readable while allowing
-- authenticated item managers to also see inactive/future categories.
-- This file mirrors the migration already applied to production Supabase.

drop policy if exists home_categories_read on public.home_subcategories;
drop policy if exists home_categories_public_read on public.home_subcategories;
drop policy if exists home_categories_staff_read on public.home_subcategories;

create policy home_categories_public_read
on public.home_subcategories
for select
to anon, authenticated
using (active);

create policy home_categories_staff_read
on public.home_subcategories
for select
to authenticated
using (public.can_manage_items());
