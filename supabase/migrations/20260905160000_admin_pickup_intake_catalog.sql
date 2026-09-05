-- Admin pickup inbox, intake metadata, and item photo support.

-- Item intake metadata used by staff and storefront filters.
alter table public.items
  add column if not exists size text,
  add column if not exists item_condition text,
  add column if not exists photo_urls text[] not null default '{}'::text[];

alter table public.items
  drop constraint if exists items_size_length,
  add constraint items_size_length check (size is null or char_length(size) between 1 and 40),
  drop constraint if exists items_condition_length,
  add constraint items_condition_length check (item_condition is null or char_length(item_condition) between 2 and 60),
  drop constraint if exists items_photo_urls_count,
  add constraint items_photo_urls_count check (cardinality(photo_urls) <= 8);

create index if not exists items_brand_idx on public.items (brand);
create index if not exists items_size_idx on public.items (size);
create index if not exists items_category_status_idx on public.items (category, status, created_at desc);

-- Public bucket for approved listing photos. Upload/delete remains admin-only via RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-photos',
  'item-photos',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Avoid duplicate policy errors if this migration is replayed in a restored environment.
drop policy if exists item_photos_admin_insert on storage.objects;
create policy item_photos_admin_insert
on storage.objects for insert
to authenticated
with check (bucket_id = 'item-photos' and public.can_manage_items());

drop policy if exists item_photos_admin_update on storage.objects;
create policy item_photos_admin_update
on storage.objects for update
to authenticated
using (bucket_id = 'item-photos' and public.can_manage_items())
with check (bucket_id = 'item-photos' and public.can_manage_items());

drop policy if exists item_photos_admin_delete on storage.objects;
create policy item_photos_admin_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'item-photos' and public.can_manage_items());

-- Expanded admin item list. Keep the legacy RPC intact for older deployments.
create or replace function public.admin_item_list_v2()
returns table (
  item_id uuid,
  owner_id uuid,
  collection_request_id uuid,
  owner_name text,
  owner_username text,
  customer_code text,
  name text,
  brand text,
  category text,
  size text,
  item_condition text,
  photo_urls text[],
  status text,
  initial_price_cents integer,
  listed_price_cents integer,
  seller_bps integer,
  platform_bps integer,
  seller_approved_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id,
    i.owner_id,
    i.collection_request_id,
    p.full_name,
    p.username,
    p.customer_code,
    i.name,
    i.brand,
    i.category,
    i.size,
    i.item_condition,
    i.photo_urls,
    i.status,
    i.initial_approved_price_cents,
    i.listed_price_cents,
    i.locked_seller_commission_bps,
    i.locked_platform_commission_bps,
    i.seller_pricing_approved_at,
    i.created_at
  from public.items i
  join public.profiles p on p.id = i.owner_id
  where public.can_manage_items()
  order by i.created_at desc
  limit 1000;
$$;

revoke all on function public.admin_item_list_v2() from public, anon;
grant execute on function public.admin_item_list_v2() to authenticated;

-- Backwards-compatible wrapper around the existing business-rule-aware item creator.
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
  created_item_id uuid;
begin
  if target_collection_request_id is not null and not exists (
    select 1 from public.collection_requests cr
    where cr.id = target_collection_request_id and cr.user_id = target_owner_id
  ) then
    raise exception 'Pickup request does not belong to the selected customer';
  end if;

  if item_size is not null and char_length(trim(item_size)) > 40 then
    raise exception 'Invalid size';
  end if;
  if item_condition is not null and char_length(trim(item_condition)) > 60 then
    raise exception 'Invalid condition';
  end if;

  created_item_id := public.admin_create_item(
    target_owner_id,
    item_name,
    item_brand,
    item_category,
    proposed_price_cents,
    below_minimum_action,
    action_reason
  );

  update public.items
  set collection_request_id = target_collection_request_id,
      size = nullif(trim(coalesce(item_size, '')), ''),
      item_condition = nullif(trim(coalesce(item_condition, '')), '')
  where id = created_item_id;

  return created_item_id;
end;
$$;

revoke all on function public.admin_create_item_v2(uuid,uuid,text,text,text,text,text,integer,text,text) from public, anon;
grant execute on function public.admin_create_item_v2(uuid,uuid,text,text,text,text,text,integer,text,text) to authenticated;

create or replace function public.admin_set_item_photos(target_item_id uuid, urls text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;
  if coalesce(cardinality(urls), 0) > 8 then
    raise exception 'A maximum of 8 photos is allowed';
  end if;
  if exists (
    select 1 from unnest(coalesce(urls, '{}'::text[])) as u(url)
    where char_length(url) > 1000 or url !~ '^https://'
  ) then
    raise exception 'Invalid photo URL';
  end if;

  update public.items set photo_urls = coalesce(urls, '{}'::text[]) where id = target_item_id;
  if not found then raise exception 'Item not found'; end if;

  insert into public.audit_logs(admin_user_id, action, entity_type, entity_id, new_value, reason)
  values (auth.uid(), 'item.photos_updated', 'item', target_item_id::text,
    jsonb_build_object('photoCount', coalesce(cardinality(urls), 0)), 'Admin item intake');
end;
$$;

revoke all on function public.admin_set_item_photos(uuid,text[]) from public, anon;
grant execute on function public.admin_set_item_photos(uuid,text[]) to authenticated;

-- Pickup inbox is part of the existing Operations snapshot so staff have one place to work.
create or replace function public.admin_operations_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.assert_admin_permission('pickups');

  select jsonb_build_object(
    'serviceAreas', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.sort_order, a.city)
      from public.service_areas a
    ), '[]'::jsonb),
    'pickupSlots', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.window_start)
      from public.pickup_slots s
      where s.window_start >= now() - interval '1 day'
    ), '[]'::jsonb),
    'collectionRequests', coalesce((
      select jsonb_agg(row_data order by created_at desc)
      from (
        select
          cr.created_at,
          jsonb_build_object(
            'id', cr.id,
            'user_id', cr.user_id,
            'request_type', cr.request_type,
            'category', cr.category,
            'address', cr.address,
            'item_count', cr.item_count,
            'brand_notes', cr.brand_notes,
            'estimated_resale_value_cents', cr.estimated_resale_value_cents,
            'pickup_fee_cents', cr.pickup_fee_cents,
            'pickup_pricing_mode', cr.pickup_pricing_mode,
            'priority_pickup', cr.priority_pickup,
            'status', cr.status,
            'confirmation_status', cr.confirmation_status,
            'scheduled_window_start', cr.scheduled_window_start,
            'scheduled_window_end', cr.scheduled_window_end,
            'created_at', cr.created_at,
            'customer_name', p.full_name,
            'customer_username', p.username,
            'customer_code', p.customer_code,
            'customer_email', u.email,
            'customer_phone', p.phone,
            'area_city', a.city
          ) as row_data
        from public.collection_requests cr
        join public.profiles p on p.id = cr.user_id
        join auth.users u on u.id = cr.user_id
        left join public.service_areas a on a.id = cr.service_area_id
        where cr.created_at >= now() - interval '180 days'
        order by cr.created_at desc
        limit 250
      ) pickup_rows
    ), '[]'::jsonb),
    'reminderSettings', (
      select to_jsonb(r) from public.pickup_reminder_settings r where singleton = true
    ),
    'reminderJobs', coalesce((
      select jsonb_agg(to_jsonb(j) order by j.scheduled_at desc)
      from public.pickup_reminder_jobs j
      where j.scheduled_at >= now() - interval '7 days'
    ), '[]'::jsonb),
    'shippingSettings', (
      select to_jsonb(sh) from public.shipping_settings sh where singleton = true
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_operations_snapshot() from public;
grant execute on function public.admin_operations_snapshot() to authenticated;

create or replace function public.admin_update_collection_request_status(
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_status text;
  new_confirmation_status text;
begin
  perform private.assert_admin_permission('pickups');

  if p_status not in ('submitted','confirmed','scheduled','collected','inspection','completed','cancelled','missed') then
    raise exception 'Invalid pickup request status';
  end if;

  select status into old_status
  from public.collection_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Pickup request not found'; end if;

  new_confirmation_status := case
    when p_status in ('confirmed','scheduled','collected','inspection','completed') then 'confirmed'
    when p_status = 'cancelled' then 'cancelled'
    else null
  end;

  update public.collection_requests
  set status = p_status,
      confirmation_status = coalesce(new_confirmation_status, confirmation_status),
      pickup_confirmed_at = case
        when p_status in ('confirmed','scheduled','collected','inspection','completed') and pickup_confirmed_at is null then now()
        else pickup_confirmed_at
      end
  where id = p_request_id;

  insert into public.audit_logs(admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason)
  values (
    auth.uid(),
    'pickup_request.status_updated',
    'collection_request',
    p_request_id::text,
    jsonb_build_object('status', old_status),
    jsonb_build_object('status', p_status),
    'Updated from Admin pickup inbox'
  );
end;
$$;

revoke all on function public.admin_update_collection_request_status(uuid,text) from public, anon;
grant execute on function public.admin_update_collection_request_status(uuid,text) to authenticated;
