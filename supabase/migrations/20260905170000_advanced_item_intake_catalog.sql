-- Advanced admin intake and the public live inventory catalog.
-- Photos are uploaded through the authenticated admin-item-photo-upload Edge Function;
-- the browser never receives a service-role key.

alter table public.items
  add column if not exists size text,
  add column if not exists item_condition text,
  add column if not exists photo_urls text[] not null default '{}',
  add column if not exists description text,
  add column if not exists published_at timestamptz;

alter table public.items
  drop constraint if exists items_status,
  drop constraint if exists items_status_check,
  add constraint items_status_check check (status = any (array[
    'submitted','pickup_requested','collected','received','inspection_pending','inspection',
    'manual_review','accepted','rejected','bundle_candidate','bundled','pricing_pending',
    'waiting_for_seller_approval','approved','photography_pending','listing_preparation',
    'listed','reserved','sold','return_requested','return_pending','returned','relisted',
    'selling_period_expired','return_to_seller','donation_pending','donated','auctioned','archived'
  ]::text[])),
  drop constraint if exists items_size_length,
  add constraint items_size_length check (size is null or char_length(size) between 1 and 40),
  drop constraint if exists items_condition_length,
  add constraint items_condition_length check (item_condition is null or char_length(item_condition) between 1 and 80),
  drop constraint if exists items_description_length,
  add constraint items_description_length check (description is null or char_length(description) <= 2000),
  drop constraint if exists items_photo_count,
  add constraint items_photo_count check (cardinality(photo_urls) <= 8);

create index if not exists items_catalog_idx on public.items (status, category, published_at desc);
create index if not exists items_brand_idx on public.items (brand);
create index if not exists items_size_idx on public.items (size);
create index if not exists items_collection_request_idx on public.items (collection_request_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('item-photos','item-photos',true,8388608,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.admin_create_item_v2(
  target_owner_id uuid,
  target_collection_request_id uuid,
  item_name text,
  item_brand text,
  item_category text,
  item_size text,
  item_condition text,
  proposed_price_cents integer,
  below_minimum_action text default 'normal',
  action_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  minimum_value integer;
  created_item_id uuid;
  chosen_status text;
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;
  if not exists (select 1 from auth.users where id=target_owner_id) then
    raise exception 'Customer does not exist';
  end if;
  if target_collection_request_id is not null and not exists (
    select 1 from public.collection_requests
    where id=target_collection_request_id and user_id=target_owner_id
  ) then
    raise exception 'Pickup request does not belong to this customer';
  end if;
  if item_name is null or char_length(trim(item_name)) < 2 or char_length(trim(item_name)) > 160 then raise exception 'Invalid item name'; end if;
  if item_brand is not null and char_length(trim(item_brand)) > 100 then raise exception 'Invalid brand'; end if;
  if item_size is not null and char_length(trim(item_size)) > 40 then raise exception 'Invalid size'; end if;
  if item_condition is not null and char_length(trim(item_condition)) > 80 then raise exception 'Invalid condition'; end if;
  if item_category not in ('women','men','kids','electronics','shoes','accessories') then raise exception 'Invalid category'; end if;
  if proposed_price_cents is null or proposed_price_cents < 1 or proposed_price_cents > 100000000 then raise exception 'Invalid proposed price'; end if;

  minimum_value := (public.get_selling_rules()->>'minimumIndividualItemValueCents')::integer;
  if proposed_price_cents >= minimum_value then
    if below_minimum_action not in ('normal','manual_review') then raise exception 'Below-minimum action is not applicable to this price'; end if;
    chosen_status := case when below_minimum_action='manual_review' then 'manual_review' else 'accepted' end;
  else
    if below_minimum_action not in ('bundle_candidate','reject','manual_review','override') then raise exception 'Select Add to Bundle, Reject, Manual Review or Owner Override'; end if;
    if below_minimum_action in ('reject','manual_review','override') and (action_reason is null or char_length(trim(action_reason)) < 3) then raise exception 'A reason is required'; end if;
    if below_minimum_action='override' and not exists (
      select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')
    ) then raise exception 'Owner or Admin is required for override'; end if;
    chosen_status := case below_minimum_action
      when 'bundle_candidate' then 'bundle_candidate'
      when 'reject' then 'rejected'
      when 'manual_review' then 'manual_review'
      when 'override' then 'accepted'
    end;
  end if;

  insert into public.items(owner_id,collection_request_id,name,brand,category,size,item_condition,status,initial_approved_price_cents)
  values(target_owner_id,target_collection_request_id,trim(item_name),nullif(trim(coalesce(item_brand,'')),''),item_category,nullif(trim(coalesce(item_size,'')),''),nullif(trim(coalesce(item_condition,'')),''),chosen_status,proposed_price_cents)
  returning id into created_item_id;

  if proposed_price_cents < minimum_value and below_minimum_action='override' then
    insert into public.item_rule_overrides(item_id,override_type,reason,admin_user_id)
    values(created_item_id,'below_minimum_value',trim(action_reason),auth.uid());
  end if;

  insert into public.item_status_history(item_id,old_status,new_status,changed_by,reason)
  values(created_item_id,null,chosen_status,auth.uid(),nullif(trim(coalesce(action_reason,'')),''));

  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
  values(auth.uid(),'item.created','item',created_item_id::text,
    jsonb_build_object('ownerId',target_owner_id,'collectionRequestId',target_collection_request_id,'name',trim(item_name),'brand',nullif(trim(coalesce(item_brand,'')),''),'category',item_category,'size',nullif(trim(coalesce(item_size,'')),''),'condition',nullif(trim(coalesce(item_condition,'')),''),'proposedPriceCents',proposed_price_cents,'status',chosen_status),
    nullif(trim(coalesce(action_reason,'')),'')
  );
  return created_item_id;
end;
$$;

revoke all on function public.admin_create_item_v2(uuid,uuid,text,text,text,text,text,integer,text,text) from public;
grant execute on function public.admin_create_item_v2(uuid,uuid,text,text,text,text,text,integer,text,text) to authenticated;

create or replace function public.admin_set_item_photos(target_item_id uuid, urls text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_items() then raise exception 'Item management permission required'; end if;
  if cardinality(coalesce(urls,'{}'::text[])) > 8 then raise exception 'Maximum 8 photos'; end if;
  update public.items set photo_urls=coalesce(urls,'{}'::text[]),updated_at=now() where id=target_item_id;
  if not found then raise exception 'Item not found'; end if;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
  values(auth.uid(),'item.photos_updated','item',target_item_id::text,jsonb_build_object('count',cardinality(coalesce(urls,'{}'::text[]))),null);
end;
$$;
revoke all on function public.admin_set_item_photos(uuid,text[]) from public;
grant execute on function public.admin_set_item_photos(uuid,text[]) to authenticated;

create or replace function public.admin_item_list_v2()
returns table(
  item_id uuid,owner_id uuid,collection_request_id uuid,owner_name text,owner_username text,customer_code text,
  name text,brand text,category text,size text,item_condition text,photo_urls text[],status text,
  initial_price_cents integer,listed_price_cents integer,seller_bps integer,platform_bps integer,
  seller_approved_at timestamptz,created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,i.owner_id,i.collection_request_id,p.full_name,p.username,p.customer_code,
    i.name,i.brand,i.category,i.size,i.item_condition,i.photo_urls,i.status,
    i.initial_approved_price_cents,i.listed_price_cents,i.locked_seller_commission_bps,
    i.locked_platform_commission_bps,i.seller_pricing_approved_at,i.created_at
  from public.items i
  join public.profiles p on p.id=i.owner_id
  where public.can_manage_items()
  order by i.created_at desc
  limit 2000;
$$;
revoke all on function public.admin_item_list_v2() from public;
grant execute on function public.admin_item_list_v2() to authenticated;

create or replace function public.admin_publish_item(target_item_id uuid,target_listed_price_cents integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.items%rowtype; final_price integer;
begin
  if auth.uid() is null or not public.can_manage_items() then raise exception 'Item management permission required'; end if;
  select * into r from public.items where id=target_item_id for update;
  if not found then raise exception 'Item not found'; end if;
  if r.seller_pricing_approved_at is null then raise exception 'Seller must approve initial pricing before listing'; end if;
  if cardinality(r.photo_urls)<1 then raise exception 'At least one photo is required before listing'; end if;
  final_price:=coalesce(target_listed_price_cents,r.initial_approved_price_cents);
  if final_price is null or final_price<1 then raise exception 'Invalid listing price'; end if;
  update public.items set listed_price_cents=final_price,status='listed',published_at=coalesce(published_at,now()),updated_at=now() where id=target_item_id;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
  values(auth.uid(),'item.published','item',target_item_id::text,jsonb_build_object('listedPriceCents',final_price),null);
end;
$$;
revoke all on function public.admin_publish_item(uuid,integer) from public;
grant execute on function public.admin_publish_item(uuid,integer) to authenticated;

create or replace function public.catalog_items()
returns table(item_id uuid,name text,brand text,category text,size text,item_condition text,photo_url text,price_cents integer,published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.size,i.item_condition,
    case when cardinality(i.photo_urls)>0 then i.photo_urls[1] else null end,
    coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at
  from public.items i
  where i.status='listed' and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
  order by i.published_at desc nulls last,i.created_at desc
  limit 1000;
$$;
revoke all on function public.catalog_items() from public;
grant execute on function public.catalog_items() to anon,authenticated;

create or replace function public.admin_operations_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_admin_permission('pickups');
  select jsonb_build_object(
    'serviceAreas',coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order,a.city) from public.service_areas a),'[]'::jsonb),
    'pickupSlots',coalesce((select jsonb_agg(to_jsonb(s) order by s.window_start) from public.pickup_slots s where s.window_start>=now()-interval '1 day'),'[]'::jsonb),
    'reminderSettings',(select to_jsonb(r) from public.pickup_reminder_settings r where singleton=true),
    'reminderJobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.scheduled_at desc) from public.pickup_reminder_jobs j where j.scheduled_at>=now()-interval '7 days'),'[]'::jsonb),
    'shippingSettings',(select to_jsonb(sh) from public.shipping_settings sh where singleton=true),
    'collectionRequests',coalesce((select jsonb_agg(q.x order by (q.x->>'created_at')::timestamptz desc) from (
      select jsonb_build_object(
        'id',cr.id,'user_id',cr.user_id,'request_type',cr.request_type,'category',cr.category,'address',cr.address,
        'item_count',cr.item_count,'brand_notes',cr.brand_notes,'estimated_resale_value_cents',cr.estimated_resale_value_cents,
        'pickup_fee_cents',cr.pickup_fee_cents,'priority_pickup',cr.priority_pickup,'status',cr.status,
        'confirmation_status',cr.confirmation_status,'scheduled_window_start',cr.scheduled_window_start,'created_at',cr.created_at,
        'customer_name',p.full_name,'customer_username',p.username,'customer_code',p.customer_code,'area_city',a.city
      ) x
      from public.collection_requests cr
      left join public.profiles p on p.id=cr.user_id
      left join public.service_areas a on a.id=cr.service_area_id
      order by cr.created_at desc limit 250
    ) q),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Authorized admins can subscribe to new pickup requests in Realtime.
drop policy if exists collection_requests_select_admin on public.collection_requests;
create policy collection_requests_select_admin
on public.collection_requests for select to authenticated
using (
  exists (
    select 1 from public.admin_roles ar
    where ar.user_id=auth.uid()
      and ar.role in ('owner','admin','operations_manager','warehouse','pickup_logistics')
      and (not ar.require_mfa or coalesce(auth.jwt()->>'aal','aal1')='aal2')
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='collection_requests'
  ) then
    alter publication supabase_realtime add table public.collection_requests;
  end if;
end $$;
