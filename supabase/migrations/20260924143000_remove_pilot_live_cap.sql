-- The pilot starts small operationally, but approved inventory should not be
-- hidden or blocked merely because more than 30 items are ready to sell.
-- NULL item_cap now means "no live-item cap". A positive cap remains available
-- as an optional operational safety control through the existing admin setting.

alter table public.pilot_settings
  alter column item_cap drop not null,
  alter column item_cap drop default;

alter table public.pilot_settings
  drop constraint if exists pilot_settings_item_cap_check;

alter table public.pilot_settings
  add constraint pilot_settings_item_cap_check
  check (item_cap is null or (item_cap >= 1 and item_cap <= 10000));

update public.pilot_settings
set item_cap = null,
    updated_at = now()
where id = true;

create or replace function private.enforce_pilot_listing()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.pilot_settings%rowtype;
begin
  select * into p from public.pilot_settings where id;
  if not found or not p.enabled or new.status <> 'listed' then
    return new;
  end if;

  if not (new.category = any(p.categories)) then
    raise exception 'This category is not enabled for the pilot storefront';
  end if;

  if p.item_cap is not null then
    perform 1 from public.pilot_settings where id for update;
    if (
      select count(*)
      from public.items i
      where i.status = 'listed'
        and i.category = any(p.categories)
        and (tg_op = 'INSERT' or i.id <> new.id)
    ) >= p.item_cap then
      raise exception 'Pilot live-item cap reached';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_pilot_listing() from public, anon, authenticated;
