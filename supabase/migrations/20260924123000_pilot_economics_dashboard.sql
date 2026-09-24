-- Pilot economics and KPI tracking. This is additive and does not remove any
-- catalog taxonomy or historical data, so the pilot can be ended reversibly.

create table if not exists public.pilot_cost_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  category text not null check (category in ('pickup','packaging','payment','shipping_subsidy','refund','storage','marketing','other')),
  amount_cents integer not null default 0 check (amount_cents between 0 and 100000000),
  labor_minutes integer not null default 0 check (labor_minutes between 0 and 100000),
  hourly_cost_cents integer not null default 0 check (hourly_cost_cents between 0 and 10000000),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists pilot_cost_entries_occurred_idx
  on public.pilot_cost_entries(occurred_at desc);

alter table public.pilot_cost_entries enable row level security;
revoke all on table public.pilot_cost_entries from public, anon, authenticated;
grant select on table public.pilot_cost_entries to authenticated;

drop policy if exists pilot_cost_entries_admin_select on public.pilot_cost_entries;
create policy pilot_cost_entries_admin_select
on public.pilot_cost_entries
for select
to authenticated
using (coalesce(public.can_manage_selling_rules(), false));

create or replace function public.admin_add_pilot_cost(
  p_category text,
  p_amount_cents integer default 0,
  p_labor_minutes integer default 0,
  p_hourly_cost_cents integer default 0,
  p_note text default null,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not coalesce(public.can_manage_selling_rules(), false) then
    raise exception 'Admin access required';
  end if;
  if p_category not in ('pickup','packaging','payment','shipping_subsidy','refund','storage','marketing','other') then
    raise exception 'Invalid pilot cost category';
  end if;
  if coalesce(p_amount_cents,0) < 0 or coalesce(p_labor_minutes,0) < 0 or coalesce(p_hourly_cost_cents,0) < 0 then
    raise exception 'Pilot costs cannot be negative';
  end if;
  if char_length(coalesce(p_note,'')) > 500 then
    raise exception 'Pilot cost note is too long';
  end if;

  insert into public.pilot_cost_entries(
    occurred_at, category, amount_cents, labor_minutes, hourly_cost_cents, note, created_by
  ) values (
    coalesce(p_occurred_at, now()), p_category, coalesce(p_amount_cents,0),
    coalesce(p_labor_minutes,0), coalesce(p_hourly_cost_cents,0), nullif(trim(coalesce(p_note,'')),''), auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_add_pilot_cost(text,integer,integer,integer,text,timestamptz) from public, anon;
grant execute on function public.admin_add_pilot_cost(text,integer,integer,integer,text,timestamptz) to authenticated;

create or replace function public.admin_pilot_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_start timestamptz := '2026-09-24 00:00:00-04'::timestamptz;
  v_end timestamptz := v_start + interval '8 weeks';
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

  select count(*)::integer
  into v_accepted
  from public.items i
  where i.created_at >= v_start
    and i.category = 'women'
    and i.status in ('accepted','waiting_for_seller_approval','listed','sold','auctioned');

  select count(*)::integer
  into v_listed
  from public.items i
  where i.category = 'women'
    and i.published_at >= v_start;

  select count(*)::integer
  into v_sold
  from public.items i
  where i.category = 'women'
    and i.created_at >= v_start
    and (i.status = 'sold' or i.sold_price_cents is not null);

  select count(*)::integer
  into v_active_listed
  from public.items i
  where i.category = 'women' and i.status = 'listed';

  select count(distinct i.owner_id)::integer
  into v_sellers
  from public.items i
  where i.category = 'women'
    and i.created_at >= v_start
    and i.status in ('accepted','waiting_for_seller_approval','listed','sold','auctioned');

  select count(*)::integer
  into v_repeat_sellers
  from (
    select i.owner_id
    from public.items i
    where i.category = 'women'
      and i.created_at >= v_start
      and i.status in ('accepted','waiting_for_seller_approval','listed','sold','auctioned')
    group by i.owner_id
    having count(*) >= 2
  ) repeaters;

  select
    coalesce(sum(i.sold_price_cents),0)::bigint,
    coalesce(sum(round(i.sold_price_cents * coalesce(i.locked_platform_commission_bps,0) / 10000.0)),0)::bigint
  into v_gross, v_platform
  from public.items i
  where i.category = 'women'
    and i.created_at >= v_start
    and i.sold_price_cents is not null;

  select
    coalesce(sum(c.amount_cents),0)::bigint,
    coalesce(sum(round(c.labor_minutes * c.hourly_cost_cents / 60.0)),0)::bigint,
    coalesce(sum(c.labor_minutes),0)::bigint
  into v_costs, v_labor, v_labor_minutes
  from public.pilot_cost_entries c
  where c.occurred_at >= v_start and c.occurred_at < v_end;

  select count(*)::integer
  into v_unsold_60
  from public.items i
  where i.category = 'women'
    and i.published_at >= v_start
    and i.published_at <= now() - interval '60 days'
    and i.status not in ('sold','returned','donated');

  if v_listed > 0 then
    v_sell_through := round(v_sold * 10000.0 / v_listed)::integer;
    v_unsold_60_rate := round(v_unsold_60 * 10000.0 / v_listed)::integer;
  end if;
  if v_sellers > 0 then
    v_repeat_rate := round(v_repeat_sellers * 10000.0 / v_sellers)::integer;
  end if;

  return jsonb_build_object(
    'start_date', v_start,
    'end_date', v_end,
    'accepted_items', v_accepted,
    'listed_items', v_listed,
    'sold_items', v_sold,
    'active_listed_items', v_active_listed,
    'real_sellers', v_sellers,
    'repeat_sellers', v_repeat_sellers,
    'gross_sales_cents', v_gross,
    'platform_commission_cents', v_platform,
    'operating_costs_cents', v_costs,
    'labor_cost_cents', v_labor,
    'labor_minutes', v_labor_minutes,
    'contribution_cents', v_platform - v_costs - v_labor,
    'average_sale_price_cents', case when v_sold > 0 then round(v_gross::numeric / v_sold)::integer else 0 end,
    'sell_through_bps', v_sell_through,
    'repeat_seller_rate_bps', v_repeat_rate,
    'unsold_older_60_days', v_unsold_60,
    'unsold_older_60_days_bps', v_unsold_60_rate
  );
end;
$$;

revoke all on function public.admin_pilot_snapshot() from public, anon;
grant execute on function public.admin_pilot_snapshot() to authenticated;
