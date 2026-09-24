-- Preserve existing home_subcategories visibility while avoiding two
-- permissive SELECT policies being evaluated for authenticated users.

drop policy if exists home_categories_public_read on public.home_subcategories;
drop policy if exists home_categories_staff_read on public.home_subcategories;

create policy home_categories_public_read
  on public.home_subcategories
  for select
  to anon
  using (active);

create policy home_categories_authenticated_read
  on public.home_subcategories
  for select
  to authenticated
  using (
    active
    or (select public.can_manage_items())
  );
