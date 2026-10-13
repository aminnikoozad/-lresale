-- Clothing publication must preserve inspection and the configured selling floor.
-- No existing inventory is rewritten. Apply only after isolated staging review.
begin;
create or replace function private.require_item_inspection_for_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
declare minimum_price integer;
begin
  if new.category <> 'home_decor' and new.status in ('listed','relisted') then
    if new.inspected_at is null then
      raise exception 'Recorded physical inspection required before publication';
    end if;
    minimum_price := (public.get_selling_rules()->>'minimumSellingPriceCents')::integer;
    if minimum_price is null or minimum_price < 1 then
      raise exception 'Valid minimum selling price configuration required';
    end if;
    if new.listed_price_cents is null or new.listed_price_cents < minimum_price then
      raise exception 'Listing is below the current minimum selling price (% cents)', minimum_price;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.require_item_inspection_for_publication() from public,anon,authenticated;
drop trigger if exists items_require_inspection_for_publication on public.items;
create trigger items_require_inspection_for_publication
before insert or update of status,published_at,inspected_at,category,listed_price_cents on public.items
for each row execute function private.require_item_inspection_for_publication();

commit;
