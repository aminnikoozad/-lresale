-- Serialize transitions into listed status so concurrent publishes cannot exceed
-- the configured pilot cap. Locking the singleton settings row is lightweight
-- and only occurs when an item is being evaluated for pilot publication.

create or replace function private.enforce_pilot_listing()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.pilot_settings%rowtype;
  live_count integer;
  entering_listed boolean := false;
begin
  select * into p from public.pilot_settings where id for update;
  if not found or not p.enabled or new.status <> 'listed' then
    return new;
  end if;

  if not (new.category = any(p.categories)) then
    raise exception 'This category is not enabled for the pilot storefront';
  end if;

  if tg_op = 'INSERT' then
    entering_listed := true;
  elsif old.status is distinct from 'listed' then
    entering_listed := true;
  end if;

  if entering_listed then
    select count(*)::integer into live_count
    from public.items i
    where i.status = 'listed' and i.category = any(p.categories);

    if live_count >= p.item_cap then
      raise exception 'Pilot live-item cap reached';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_pilot_listing() from public, anon, authenticated;
