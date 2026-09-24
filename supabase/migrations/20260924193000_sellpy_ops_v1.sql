-- REWEAR Sellpy-inspired Operations V1
-- Additive warehouse/processing layer. Existing storefront/order tables remain intact.

create extension if not exists pg_cron;

create sequence if not exists public.rewear_item_code_seq as bigint start with 1000;
revoke all on sequence public.rewear_item_code_seq from public, anon, authenticated;

create table if not exists public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.item_operations (
  item_id uuid primary key references public.items(id) on delete cascade,
  item_code text not null unique default ('RW-' || lpad(nextval('public.rewear_item_code_seq')::text, 8, '0')),
  stage text not null default 'inspection' check (stage in (
    'inspection','photography','seller_review','ready_to_publish','live','last_chance',
    'reserved','sold','expired','returning','donation','closed'
  )),
  warehouse_location_id uuid references public.warehouse_locations(id) on delete set null,
  review_ready_at timestamptz,
  review_deadline_at timestamptz,
  auto_publish_enabled boolean not null default true,
  auto_publish_at timestamptz,
  markdown_base_price_cents integer check (markdown_base_price_cents is null or markdown_base_price_cents > 0),
  last_markdown_day integer not null default 0 check (last_markdown_day >= 0),
  last_chance_at timestamptz,
  selling_expires_at timestamptz,
  stage_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.item_operation_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 2 and 60),
  stage text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists item_operations_stage_idx on public.item_operations(stage, stage_updated_at);
create index if not exists item_operations_location_idx on public.item_operations(warehouse_location_id) where warehouse_location_id is not null;
create index if not exists item_operations_review_deadline_idx on public.item_operations(review_deadline_at) where review_deadline_at is not null;
create index if not exists item_operations_expiry_idx on public.item_operations(selling_expires_at) where selling_expires_at is not null;
create index if not exists item_operation_events_item_created_idx on public.item_operation_events(item_id, created_at desc);

alter table public.warehouse_locations enable row level security;
alter table public.item_operations enable row level security;
alter table public.item_operation_events enable row level security;

revoke all on public.warehouse_locations from public, anon, authenticated;
revoke all on public.item_operations from public, anon, authenticated;
revoke all on public.item_operation_events from public, anon, authenticated;
grant select on public.item_operations to authenticated;
grant select on public.item_operation_events to authenticated;

create policy item_operations_owner_read on public.item_operations
for select to authenticated
using (exists (
  select 1 from public.items i
  where i.id = item_operations.item_id
    and i.owner_id = (select auth.uid())
));

create policy item_operation_events_owner_read on public.item_operation_events
for select to authenticated
using (exists (
  select 1 from public.items i
  where i.id = item_operation_events.item_id
    and i.owner_id = (select auth.uid())
));

create or replace function private.touch_rewear_ops_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger warehouse_locations_touch
before update on public.warehouse_locations
for each row execute function private.touch_rewear_ops_updated_at();

create trigger item_operations_touch
before update on public.item_operations
for each row execute function private.touch_rewear_ops_updated_at();

create or replace function private.sync_item_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_stage text;
  desired_stage text;
  rules jsonb;
  selling_days integer;
  expiry timestamptz;
  last_chance timestamptz;
begin
  insert into public.item_operations(item_id)
  values (new.id)
  on conflict (item_id) do nothing;

  select stage into current_stage
  from public.item_operations
  where item_id = new.id
  for update;

  desired_stage := case
    when new.status in ('rejected','returned','donated','archived') then 'closed'
    when new.status = 'return_to_seller' then 'returning'
    when new.status = 'donation_pending' then 'donation'
    when new.status = 'selling_period_expired' then 'expired'
    when new.status = 'sold' then 'sold'
    when new.status = 'reserved' then 'reserved'
    when new.status in ('listed','relisted') then 'live'
    when new.seller_pricing_approved_at is not null then 'ready_to_publish'
    when new.inspected_at is not null and cardinality(coalesce(new.photo_urls,'{}'::text[])) > 0 then 'seller_review'
    when new.inspected_at is not null then 'photography'
    else 'inspection'
  end;

  if new.inspected_at is not null
     and cardinality(coalesce(new.photo_urls,'{}'::text[])) > 0
     and new.initial_approved_price_cents is not null
     and new.seller_pricing_approved_at is null
     and new.status in ('accepted','waiting_for_seller_approval') then
    update public.item_operations
       set review_ready_at = coalesce(review_ready_at, now()),
           review_deadline_at = coalesce(review_deadline_at, now() + interval '48 hours'),
           stage = 'seller_review',
           stage_updated_at = case when stage <> 'seller_review' then now() else stage_updated_at end
     where item_id = new.id;
    desired_stage := 'seller_review';
  end if;

  if new.seller_pricing_approved_at is not null then
    update public.item_operations
       set auto_publish_at = coalesce(auto_publish_at, now()),
           markdown_base_price_cents = coalesce(markdown_base_price_cents, new.initial_approved_price_cents)
     where item_id = new.id;
  end if;

  if new.status in ('listed','relisted') and new.published_at is not null then
    rules := public.get_selling_rules();
    selling_days := greatest(1, coalesce((rules->>'sellingPeriodDays')::integer, 90));
    expiry := new.published_at + make_interval(days => selling_days);
    last_chance := greatest(new.published_at, expiry - interval '14 days');
    update public.item_operations
       set selling_expires_at = coalesce(selling_expires_at, expiry),
           last_chance_at = coalesce(last_chance_at, last_chance),
           markdown_base_price_cents = coalesce(markdown_base_price_cents, new.initial_approved_price_cents, new.listed_price_cents)
     where item_id = new.id;
  end if;

  if desired_stage is distinct from current_stage then
    update public.item_operations
       set stage = desired_stage, stage_updated_at = now()
     where item_id = new.id;
    insert into public.item_operation_events(item_id,event_type,stage,details,changed_by)
    values (new.id,'stage_changed',desired_stage,jsonb_build_object('from',current_stage,'to',desired_stage),auth.uid());
  end if;

  if tg_op = 'UPDATE' and new.listed_price_cents is distinct from old.listed_price_cents then
    insert into public.item_operation_events(item_id,event_type,stage,details,changed_by)
    values (new.id,'price_changed',desired_stage,jsonb_build_object('fromCents',old.listed_price_cents,'toCents',new.listed_price_cents),auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists items_sync_rewear_operations on public.items;
create trigger items_sync_rewear_operations
after insert or update of status, inspected_at, photo_urls, initial_approved_price_cents, listed_price_cents, seller_pricing_approved_at, published_at
on public.items
for each row execute function private.sync_item_operation();

insert into public.item_operations(item_id,stage,review_ready_at,review_deadline_at,auto_publish_at,markdown_base_price_cents,last_chance_at,selling_expires_at)
select
  i.id,
  case
    when i.status in ('rejected','returned','donated','archived') then 'closed'
    when i.status='return_to_seller' then 'returning'
    when i.status='donation_pending' then 'donation'
    when i.status='selling_period_expired' then 'expired'
    when i.status='sold' then 'sold'
    when i.status='reserved' then 'reserved'
    when i.status in ('listed','relisted') then 'live'
    when i.seller_pricing_approved_at is not null then 'ready_to_publish'
    when i.inspected_at is not null and cardinality(coalesce(i.photo_urls,'{}'::text[])) > 0 then 'seller_review'
    when i.inspected_at is not null then 'photography'
    else 'inspection'
  end,
  case when i.inspected_at is not null and cardinality(coalesce(i.photo_urls,'{}'::text[])) > 0 and i.seller_pricing_approved_at is null then now() end,
  case when i.inspected_at is not null and cardinality(coalesce(i.photo_urls,'{}'::text[])) > 0 and i.seller_pricing_approved_at is null then now()+interval '48 hours' end,
  case when i.seller_pricing_approved_at is not null and i.status not in ('listed','relisted','reserved','sold') then now() end,
  coalesce(i.initial_approved_price_cents,i.listed_price_cents),
  case when i.published_at is not null then greatest(i.published_at, i.published_at + make_interval(days => greatest(1,coalesce((public.get_selling_rules()->>'sellingPeriodDays')::integer,90))) - interval '14 days') end,
  case when i.published_at is not null then i.published_at + make_interval(days => greatest(1,coalesce((public.get_selling_rules()->>'sellingPeriodDays')::integer,90))) end
from public.items i
on conflict (item_id) do nothing;

create or replace function public.admin_create_warehouse_location(target_code text, target_label text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if auth.uid() is null or not public.can_manage_items() then raise exception 'Item management permission required'; end if;
  if upper(trim(target_code)) !~ '^[A-Z0-9][A-Z0-9-]{1,31}$' then raise exception 'Invalid location code'; end if;
  insert into public.warehouse_locations(code,label)
  values (upper(trim(target_code)),nullif(trim(coalesce(target_label,'')),''))
  returning id into created_id;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value)
  values(auth.uid(),'warehouse.location_created','warehouse_location',created_id::text,jsonb_build_object('code',upper(trim(target_code)),'label',target_label));
  return created_id;
end;
$$;

create or replace function public.admin_assign_item_location(target_item_id uuid, target_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare location_code text;
begin
  if auth.uid() is null or not public.can_manage_items() then raise exception 'Item management permission required'; end if;
  select code into location_code from public.warehouse_locations where id=target_location_id and active;
  if location_code is null then raise exception 'Warehouse location unavailable'; end if;
  if not exists(select 1 from public.items where id=target_item_id) then raise exception 'Item not found'; end if;
  insert into public.item_operations(item_id) values(target_item_id) on conflict(item_id) do nothing;
  update public.item_operations set warehouse_location_id=target_location_id where item_id=target_item_id;
  insert into public.item_operation_events(item_id,event_type,stage,details,changed_by)
  select target_item_id,'warehouse_location_assigned',stage,jsonb_build_object('locationId',target_location_id,'locationCode',location_code),auth.uid()
  from public.item_operations where item_id=target_item_id;
end;
$$;

create or replace function public.admin_processing_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.can_manage_items() then jsonb_build_object(
    'counts', coalesce((
      select jsonb_object_agg(stage,total) from (
        select stage,count(*)::integer total from public.item_operations group by stage order by stage
      ) q
    ), '{}'::jsonb),
    'items', coalesce((
      select jsonb_agg(row_data order by created_at desc) from (
        select
          i.created_at,
          jsonb_build_object(
            'itemId',i.id,'itemCode',o.item_code,'name',i.name,'brand',i.brand,'status',i.status,'stage',o.stage,
            'ownerName',p.full_name,'customerCode',p.customer_code,'photoCount',cardinality(coalesce(i.photo_urls,'{}'::text[])),
            'inspectedAt',i.inspected_at,'reviewDeadlineAt',o.review_deadline_at,'publishedAt',i.published_at,
            'lastChanceAt',o.last_chance_at,'sellingExpiresAt',o.selling_expires_at,'listedPriceCents',i.listed_price_cents,
            'warehouseLocationId',o.warehouse_location_id,'warehouseLocationCode',w.code
          ) row_data
        from public.items i
        join public.item_operations o on o.item_id=i.id
        join public.profiles p on p.id=i.owner_id
        left join public.warehouse_locations w on w.id=o.warehouse_location_id
        order by i.created_at desc
        limit 500
      ) s
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'code',code,'label',label,'active',active) order by code)
      from public.warehouse_locations
    ), '[]'::jsonb)
  ) else null end;
$$;

create or replace function public.seller_operations_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'itemId',i.id,'itemCode',o.item_code,'name',i.name,'status',i.status,'stage',o.stage,
        'reviewReadyAt',o.review_ready_at,'reviewDeadlineAt',o.review_deadline_at,
        'autoPublishAt',o.auto_publish_at,'publishedAt',i.published_at,'lastChanceAt',o.last_chance_at,
        'sellingExpiresAt',o.selling_expires_at,'listedPriceCents',i.listed_price_cents,
        'initialPriceCents',i.initial_approved_price_cents,'dispositionPreference',i.seller_disposition_preference,
        'timeline', coalesce((
          select jsonb_agg(ev order by occurred_at desc) from (
            select jsonb_build_object('type','status','label',h.new_status,'at',h.created_at,'reason',h.reason) ev,h.created_at occurred_at
            from public.item_status_history h where h.item_id=i.id
            union all
            select jsonb_build_object('type',e.event_type,'label',coalesce(e.stage,e.event_type),'at',e.created_at,'details',e.details) ev,e.created_at occurred_at
            from public.item_operation_events e where e.item_id=i.id
            order by occurred_at desc limit 20
          ) t
        ), '[]'::jsonb)
      ) order by i.created_at desc)
      from public.items i join public.item_operations o on o.item_id=i.id
      where i.owner_id=auth.uid()
    ), '[]'::jsonb)
  ) end;
$$;

create or replace function public.seller_schedule_auto_publish(target_item_id uuid, expected_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare deadline timestamptz;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.items where id=target_item_id and owner_id=auth.uid()) then raise exception 'Item unavailable'; end if;
  perform public.approve_item_pricing(target_item_id,expected_price);
  select review_deadline_at into deadline from public.item_operations where item_id=target_item_id;
  update public.item_operations
     set auto_publish_enabled=true,
         auto_publish_at=coalesce(deadline,now()+interval '48 hours')
   where item_id=target_item_id;
  insert into public.item_operation_events(item_id,event_type,stage,details,changed_by)
  select target_item_id,'auto_publish_scheduled',stage,jsonb_build_object('publishAt',coalesce(deadline,now()+interval '48 hours')),auth.uid()
  from public.item_operations where item_id=target_item_id;
end;
$$;

create or replace function private.run_rewear_ops_automations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  rules jsonb := public.get_selling_rules();
  schedule jsonb := coalesce(public.get_selling_rules()->'discountSchedule','[]'::jsonb);
  minimum_price integer := greatest(1,coalesce((public.get_selling_rules()->>'minimumSellingPriceCents')::integer,1));
  days_live integer;
  discount_bps integer;
  target_price integer;
  published_count integer := 0;
  markdown_count integer := 0;
  last_chance_count integer := 0;
  expired_count integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('rewear_ops_automation')) then
    return jsonb_build_object('skipped','already_running');
  end if;

  for r in
    select i.id
    from public.items i join public.item_operations o on o.item_id=i.id
    where o.auto_publish_enabled
      and o.auto_publish_at is not null and o.auto_publish_at <= now()
      and i.seller_pricing_approved_at is not null
      and i.inspected_at is not null
      and cardinality(coalesce(i.photo_urls,'{}'::text[])) > 0
      and i.status in ('accepted','waiting_for_seller_approval','approved','listing_preparation','photography_pending')
  loop
    begin
      update public.items
         set listed_price_cents=coalesce(listed_price_cents,initial_approved_price_cents),
             status='listed', published_at=coalesce(published_at,now()), updated_at=now()
       where id=r.id;
      insert into public.item_status_history(item_id,old_status,new_status,changed_by,reason)
      values(r.id,null,'listed',null,'Automatic publish after seller-approved review window');
      update public.item_operations set auto_publish_at=null where item_id=r.id;
      published_count := published_count + 1;
    exception when others then
      insert into public.item_operation_events(item_id,event_type,details)
      values(r.id,'automation_error',jsonb_build_object('step','publish','message',sqlerrm));
    end;
  end loop;

  for r in
    select i.id,i.published_at,i.initial_approved_price_cents,i.listed_price_cents,o.last_markdown_day
    from public.items i join public.item_operations o on o.item_id=i.id
    where i.status in ('listed','relisted') and i.published_at is not null
  loop
    days_live := greatest(0,floor(extract(epoch from (now()-r.published_at))/86400)::integer);
    select max((entry->>'discountBps')::integer)
      into discount_bps
      from jsonb_array_elements(schedule) entry
     where coalesce((entry->>'startDay')::integer,2147483647) <= days_live;
    if discount_bps is not null and discount_bps between 0 and 10000 and r.initial_approved_price_cents is not null then
      target_price := greatest(minimum_price,round(r.initial_approved_price_cents * (10000-discount_bps) / 10000.0)::integer);
      if r.listed_price_cents is null or target_price < r.listed_price_cents then
        update public.items set listed_price_cents=target_price,updated_at=now() where id=r.id;
        update public.item_operations set last_markdown_day=days_live where item_id=r.id;
        insert into public.item_operation_events(item_id,event_type,stage,details)
        select r.id,'automatic_markdown',stage,jsonb_build_object('day',days_live,'discountBps',discount_bps,'priceCents',target_price)
        from public.item_operations where item_id=r.id;
        markdown_count := markdown_count + 1;
      end if;
    end if;
  end loop;

  update public.item_operations o
     set stage='last_chance',stage_updated_at=now()
    from public.items i
   where i.id=o.item_id and i.status in ('listed','relisted')
     and o.last_chance_at is not null and o.last_chance_at <= now()
     and o.stage='live';
  get diagnostics last_chance_count = row_count;

  for r in
    select i.id,i.status,i.seller_disposition_preference
    from public.items i join public.item_operations o on o.item_id=i.id
    where i.status in ('listed','relisted')
      and o.selling_expires_at is not null and o.selling_expires_at <= now()
      and not exists(select 1 from public.inventory_reservations ir where ir.item_id=i.id and ir.status='active' and ir.expires_at>now())
  loop
    update public.items
       set status=case r.seller_disposition_preference when 'return' then 'return_to_seller' when 'donate' then 'donation_pending' else 'selling_period_expired' end,
           updated_at=now()
     where id=r.id;
    insert into public.item_status_history(item_id,old_status,new_status,changed_by,reason)
    values(r.id,r.status,case r.seller_disposition_preference when 'return' then 'return_to_seller' when 'donate' then 'donation_pending' else 'selling_period_expired' end,null,'Selling period completed automatically');
    expired_count := expired_count + 1;
  end loop;

  return jsonb_build_object('published',published_count,'markdowns',markdown_count,'lastChance',last_chance_count,'expired',expired_count);
end;
$$;

create or replace function public.admin_run_rewear_ops_automations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_items() then raise exception 'Item management permission required'; end if;
  return private.run_rewear_ops_automations();
end;
$$;

revoke all on function public.admin_create_warehouse_location(text,text) from public;
revoke all on function public.admin_assign_item_location(uuid,uuid) from public;
revoke all on function public.admin_processing_snapshot() from public;
revoke all on function public.seller_operations_snapshot() from public;
revoke all on function public.seller_schedule_auto_publish(uuid,integer) from public;
revoke all on function public.admin_run_rewear_ops_automations() from public;
grant execute on function public.admin_create_warehouse_location(text,text) to authenticated;
grant execute on function public.admin_assign_item_location(uuid,uuid) to authenticated;
grant execute on function public.admin_processing_snapshot() to authenticated;
grant execute on function public.seller_operations_snapshot() to authenticated;
grant execute on function public.seller_schedule_auto_publish(uuid,integer) to authenticated;
grant execute on function public.admin_run_rewear_ops_automations() to authenticated;

-- Run every hour at :15 UTC. Same-name schedule is idempotently replaced by pg_cron.
select cron.schedule(
  'rewear-ops-automation',
  '15 * * * *',
  $$select private.run_rewear_ops_automations();$$
);
