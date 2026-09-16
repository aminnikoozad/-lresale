-- Managed resale trust workflow: structured inspection, customer disposition preference,
-- catalog inspection metadata, and internal historical-sale pricing signals.

alter table public.items add column if not exists inspection_notes text;
alter table public.items add column if not exists inspection_checks jsonb not null default '{}'::jsonb;
alter table public.items add column if not exists inspected_at timestamptz;
alter table public.items add column if not exists seller_disposition_preference text;

do $$ begin
  alter table public.items add constraint items_disposition_preference_check
    check (seller_disposition_preference is null or seller_disposition_preference in ('return','donate'));
exception when duplicate_object then null; end $$;

-- Existing live inventory was already staff-reviewed under the previous managed workflow.
update public.items
set inspected_at = coalesce(inspected_at, published_at, updated_at)
where status in ('listed','reserved','sold','paid') and inspected_at is null;

create or replace function public.admin_set_item_inspection(
  target_item_id uuid,
  target_condition text,
  target_notes text default null,
  target_checks jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  current_item public.items%rowtype;
  clean_checks jsonb := coalesce(target_checks,'{}'::jsonb);
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;
  select * into current_item from public.items where id=target_item_id for update;
  if not found then raise exception 'Item not found'; end if;
  if target_condition is null or char_length(trim(target_condition)) < 2 or char_length(trim(target_condition)) > 80 then
    raise exception 'Select a valid condition';
  end if;
  if target_notes is not null and char_length(trim(target_notes)) > 1000 then
    raise exception 'Inspection notes are too long';
  end if;
  if jsonb_typeof(clean_checks) <> 'object' then raise exception 'Inspection checks must be an object'; end if;

  update public.items
  set item_condition=trim(target_condition),
      inspection_notes=nullif(trim(coalesce(target_notes,'')),''),
      inspection_checks=clean_checks,
      inspected_at=now(),
      updated_at=now()
  where id=target_item_id;

  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values(
    auth.uid(),'item.inspected','item',target_item_id::text,
    jsonb_build_object('condition',current_item.item_condition,'inspectedAt',current_item.inspected_at),
    jsonb_build_object('condition',trim(target_condition),'checks',clean_checks,'inspectedAt',now()),
    nullif(trim(coalesce(target_notes,'')),'')
  );
end;
$$;

revoke all on function public.admin_set_item_inspection(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_set_item_inspection(uuid,text,text,jsonb) to authenticated;

create or replace function public.set_item_disposition_preference(target_item_id uuid,target_preference text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare current_status text;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
  if target_preference not in ('return','donate') then raise exception 'Invalid preference'; end if;
  select status into current_status from public.items where id=target_item_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Item not available'; end if;
  if current_status in ('sold','paid') then raise exception 'Preference cannot be changed after a completed sale'; end if;
  update public.items set seller_disposition_preference=target_preference,updated_at=now()
  where id=target_item_id and owner_id=auth.uid();
end;
$$;

revoke all on function public.set_item_disposition_preference(uuid,text) from public,anon;
grant execute on function public.set_item_disposition_preference(uuid,text) to authenticated;

create or replace function public.admin_item_list_v3()
returns table(
  item_id uuid, owner_id uuid, collection_request_id uuid, owner_name text, owner_username text, customer_code text,
  name text, brand text, category text, size text, item_condition text, photo_urls text[], status text,
  initial_price_cents integer, listed_price_cents integer, seller_bps integer, platform_bps integer,
  seller_approved_at timestamptz, created_at timestamptz, published_at timestamptz,
  inspection_notes text, inspection_checks jsonb, inspected_at timestamptz, seller_disposition_preference text,
  suggested_price_cents integer, suggested_price_sample_size integer
)
language sql
stable
security definer
set search_path=''
as $$
  select
    i.id,i.owner_id,i.collection_request_id,p.full_name,p.username,p.customer_code,i.name,i.brand,i.category,i.size,
    i.item_condition,i.photo_urls,i.status,i.initial_approved_price_cents,i.listed_price_cents,
    i.locked_seller_commission_bps,i.locked_platform_commission_bps,i.seller_pricing_approved_at,i.created_at,i.published_at,
    i.inspection_notes,i.inspection_checks,i.inspected_at,i.seller_disposition_preference,
    coalesce(
      case when brand_stats.sample_size >= 2 then brand_stats.median_cents end,
      case when category_stats.sample_size >= 3 then category_stats.median_cents end
    )::integer as suggested_price_cents,
    case
      when brand_stats.sample_size >= 2 then brand_stats.sample_size
      when category_stats.sample_size >= 3 then category_stats.sample_size
      else 0
    end::integer as suggested_price_sample_size
  from public.items i
  join public.profiles p on p.id=i.owner_id
  left join lateral (
    select count(*)::integer sample_size,
           percentile_cont(0.5) within group(order by s.sold_price_cents)::integer median_cents
    from public.items s
    where s.id<>i.id and s.sold_price_cents is not null and i.brand is not null and s.brand is not null
      and lower(trim(s.brand))=lower(trim(i.brand))
  ) brand_stats on true
  left join lateral (
    select count(*)::integer sample_size,
           percentile_cont(0.5) within group(order by s.sold_price_cents)::integer median_cents
    from public.items s
    where s.id<>i.id and s.sold_price_cents is not null and s.category=i.category
  ) category_stats on true
  where public.can_manage_items()
  order by i.created_at desc
  limit 2000;
$$;

revoke all on function public.admin_item_list_v3() from public,anon;
grant execute on function public.admin_item_list_v3() to authenticated;

create or replace function public.catalog_items_v2()
returns table(
  item_id uuid,name text,brand text,category text,size text,item_condition text,photo_url text,price_cents integer,
  published_at timestamptz,inspected_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.size,i.item_condition,
         case when cardinality(i.photo_urls)>0 then i.photo_urls[1] else null end,
         coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at,i.inspected_at
  from public.items i
  where i.status='listed' and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
  order by i.published_at desc nulls last,i.created_at desc
  limit 1000;
$$;

grant execute on function public.catalog_items_v2() to anon,authenticated;

create or replace function public.catalog_item_detail(target_item_id uuid)
returns table(
  item_id uuid,name text,brand text,category text,size text,item_condition text,photo_urls text[],description text,
  price_cents integer,published_at timestamptz,inspected_at timestamptz,inspection_notes text,inspection_checks jsonb
)
language sql
stable
security definer
set search_path=''
as $$
  select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.size,i.item_condition,i.photo_urls,i.description,
         coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at,i.inspected_at,i.inspection_notes,i.inspection_checks
  from public.items i
  where i.id=target_item_id and i.status='listed' and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
  limit 1;
$$;

grant execute on function public.catalog_item_detail(uuid) to anon,authenticated;

create or replace function public.admin_publish_item(target_item_id uuid, target_listed_price_cents integer default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare r public.items%rowtype; final_price integer;
begin
  if auth.uid() is null or not public.can_manage_items() then raise exception 'Item management permission required'; end if;
  select * into r from public.items where id=target_item_id for update;
  if not found then raise exception 'Item not found'; end if;
  if r.seller_pricing_approved_at is null then raise exception 'Seller must approve initial pricing before listing'; end if;
  if cardinality(r.photo_urls)<1 then raise exception 'At least one photo is required before listing'; end if;
  if r.inspected_at is null then raise exception 'Complete the Rewear inspection before publishing'; end if;
  final_price:=coalesce(target_listed_price_cents,r.initial_approved_price_cents);
  if final_price is null or final_price<1 then raise exception 'Invalid listing price'; end if;
  update public.items
  set listed_price_cents=final_price,status='listed',published_at=coalesce(published_at,now()),updated_at=now()
  where id=target_item_id;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
  values(auth.uid(),'item.published','item',target_item_id::text,jsonb_build_object('listedPriceCents',final_price,'inspectedAt',r.inspected_at),null);
end;
$$;
