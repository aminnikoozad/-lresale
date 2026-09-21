-- Align active Home & Decor subcategories with the approved existing-site expansion.
-- Keep old values in the lookup table as inactive for backward compatibility.

insert into public.home_subcategories(name, active)
values
  ('Decorative Tableware', true),
  ('Other Home Decor', true)
on conflict (name) do update set active = excluded.active;

update public.home_subcategories
set active = false
where name in (
  'Tableware & Decorative Dishes',
  'Vintage & Collectibles',
  'Antiques'
);
