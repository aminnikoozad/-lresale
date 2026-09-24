-- Enforce the reversible pilot from public.pilot_settings at the database layer.
-- Changing pilot_settings via the existing admin_save_pilot RPC immediately
-- changes accepted categories, live-item cap and pickup weekdays without code edits.

update public.pilot_settings
set started_at = '2026-09-24 00:00:00-04'::timestamptz,
    updated_at = now()
where id and started_at is null;

create or replace function private.enforce_pilot_collection_category()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.pilot_settings%rowtype;
begin
  select * into p from public.pilot_settings where id;
  if found and p.enabled and not (new.category = any(p.categories)) then
    raise exception 'This category is not accepting pickup requests during the pilot';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_pilot_collection_category() from public, anon, authenticated;

drop trigger if exists collection_requests_enforce_pilot_category on public.collection_requests;
create trigger collection_requests_enforce_pilot_category
before insert or update of category on public.collection_requests
for each row execute function private.enforce_pilot_collection_category();

create or replace function private.enforce_pilot_listing()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.pilot_settings%rowtype;
  live_count integer;
begin
  select * into p from public.pilot_settings where id;
  if not found or not p.enabled or new.status <> 'listed' then return new; end if;

  if not (new.category = any(p.categories)) then
    raise exception 'This category is not enabled for the pilot storefront';
  end if;

  if tg_op = 'INSERT' or old.status is distinct from 'listed' then
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

drop trigger if exists items_enforce_pilot_listing on public.items;
create trigger items_enforce_pilot_listing
before insert or update of status, category on public.items
for each row execute function private.enforce_pilot_listing();

create or replace function private.reserve_pickup_slot()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  selected_slot public.pickup_slots%rowtype;
  p public.pilot_settings%rowtype;
  local_weekday integer;
begin
  select slot.* into selected_slot
  from public.pickup_slots as slot
  join public.service_areas as area on area.id = slot.service_area_id
  where slot.id = new.pickup_slot_id
    and slot.service_area_id = new.service_area_id
    and area.active
  for update of slot;

  if not found or not selected_slot.active or selected_slot.window_start <= now() or selected_slot.booked_count >= selected_slot.capacity then
    raise exception 'pickup slot is not available';
  end if;

  select * into p from public.pilot_settings where id;
  if found and p.enabled then
    local_weekday := extract(dow from (selected_slot.window_start at time zone 'America/Toronto'))::integer;
    if not (local_weekday = any(p.pickup_days)) then
      raise exception 'This pickup weekday is not available during the pilot';
    end if;
  end if;

  new.scheduled_for := selected_slot.window_start;
  new.scheduled_window_start := selected_slot.window_start;
  new.scheduled_window_end := selected_slot.window_end;

  update public.pickup_slots
  set booked_count = booked_count + 1
  where id = selected_slot.id;

  return new;
end;
$$;
revoke all on function private.reserve_pickup_slot() from public, anon, authenticated;

create or replace function public.admin_pilot_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  p public.pilot_settings%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_accepted integer := 0;
  v_listed integer := 0;
  v_sold integer := 0;
  v_active_listed integer := 0;
  v_sellers integer := 0;
  v_repeat_sellers integer := 0;
  v_gross bigint := 0;
  v_platform bigint := 0;
  v_costs bigint := 0;
  v_labor bigint := 0;
  v_labor_minutes bigint := 0;
  v_unsold_60 integer := 0;
  v_sell_through integer := 0;
  v_repeat_rate integer := 0;
  v_unsold_60_rate integer := 0;
begin
  if auth.uid() is null or not coalesce(public.can_manage_selling_rules(), false) then
    raise exception 'Admin access required';
  end if;

  select * into p from public.pilot_settings where id;
  v_start := coalesce(p.started_at, '2026-09-24 00:00:00-04'::timestamptz);
  v_end := v_start + make_interval(weeks => coalesce(p.duration_weeks, 8));

  select count(*)::integer into v_accepted
  from public.items i
  where i.created_at >= v_start and i.category = any(p.categories)
    and i.status in ('accepted','waiting_for_seller_approval','listed','sold','auctioned');

  select count(*)::integer into v_listed
  from public.items i
  where i.category = any(p.categories) and i.published_at >= v_start;

  select count(*)::integer into v_sold
  from public.items i
  where i.category = any(p.categories) and i.created_at >= v_start
    and (i.status = 'sold' or i.sold_price_cents is not null);

  select count(*)::integer into v_active_listed
  from public.items i where i.category = any(p.categories) and i.status = 'listed';

  select count(distinct i.owner_id)::integer into v_sellers
  from public.items i
  where i.category = any(p.categories) and i.created_at >= v_start
    and i.status in ('accepted','waiting_for_seller_approval','listed','sold','auctioned');

  select count(*)::integer into v_repeat_sellers
  from (
    select i.owner_id
    from public.items i
    where i.category = any(p.categories) and i.created_at >= v_start
      and i.status in ('accepted','waiting_for_seller_approval','listed','sold','auctioned')
    group by i.owner_id having count(*) >= 2
  ) repeaters;

  select coalesce(sum(i.sold_price_cents),0)::bigint,
         coalesce(sum(round(i.sold_price_cents * coalesce(i.locked_platform_commission_bps,0) / 10000.0)),0)::bigint
  into v_gross, v_platform
  from public.items i
  where i.category = any(p.categories) and i.created_at >= v_start and i.sold_price_cents is not null;

  select coalesce(sum(c.amount_cents),0)::bigint,
         coalesce(sum(round(c.labor_minutes * c.hourly_cost_cents / 60.0)),0)::bigint,
         coalesce(sum(c.labor_minutes),0)::bigint
  into v_costs, v_labor, v_labor_minutes
  from public.pilot_cost_entries c
  where c.occurred_at >= v_start and c.occurred_at < v_end;

  select count(*)::integer into v_unsold_60
  from public.items i
  where i.category = any(p.categories) and i.published_at >= v_start
    and i.published_at <= now() - interval '60 days'
    and i.status not in ('sold','returned','donated');

  if v_listed > 0 then
    v_sell_through := round(v_sold * 10000.0 / v_listed)::integer;
    v_unsold_60_rate := round(v_unsold_60 * 10000.0 / v_listed)::integer;
  end if;
  if v_sellers > 0 then v_repeat_rate := round(v_repeat_sellers * 10000.0 / v_sellers)::integer; end if;

  return jsonb_build_object(
    'start_date', v_start, 'end_date', v_end,
    'accepted_items', v_accepted, 'listed_items', v_listed, 'sold_items', v_sold,
    'active_listed_items', v_active_listed, 'real_sellers', v_sellers,
    'repeat_sellers', v_repeat_sellers, 'gross_sales_cents', v_gross,
    'platform_commission_cents', v_platform, 'operating_costs_cents', v_costs,
    'labor_cost_cents', v_labor, 'labor_minutes', v_labor_minutes,
    'contribution_cents', v_platform - v_costs - v_labor,
    'average_sale_price_cents', case when v_sold > 0 then round(v_gross::numeric / v_sold)::integer else 0 end,
    'sell_through_bps', v_sell_through, 'repeat_seller_rate_bps', v_repeat_rate,
    'unsold_older_60_days', v_unsold_60, 'unsold_older_60_days_bps', v_unsold_60_rate
  );
end;
$$;

revoke all on function public.admin_pilot_snapshot() from public, anon;
grant execute on function public.admin_pilot_snapshot() to authenticated;
