-- Lower the minimum approved individual listing price from $25 to $20.

alter table public.items
  drop constraint if exists items_initial_approved_price_cents_check;

alter table public.items
  add constraint items_initial_approved_price_cents_check
  check (
    initial_approved_price_cents is null
    or initial_approved_price_cents between 2000 and 100000000
  );
