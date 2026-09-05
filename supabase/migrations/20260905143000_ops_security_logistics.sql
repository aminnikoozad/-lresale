-- Operations, security, pickup scheduling, reminder and shipping foundations.

-- 1) Shoes are a first-class collection category.
alter table public.collection_requests
  drop constraint if exists collection_category;
alter table public.collection_requests
  add constraint collection_category
  check (category = any (array['clothing'::text, 'shoes'::text, 'electronics'::text]));

-- 2) Expand pickup service-area metadata for the Montréal 20 km pilot zone.
alter table public.service_areas
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists distance_from_montreal_km numeric(6,2),
  add column if not exists within_local_radius boolean not null default false;

update public.service_areas
set latitude = 45.5017,
    longitude = -73.5673,
    distance_from_montreal_km = 0,
    within_local_radius = true,
    active = true,
    pickup_mode = 'free'
where city = 'Montréal';

insert into public.service_areas (city, province, pickup_mode, active, sort_order, latitude, longitude, distance_from_montreal_km, within_local_radius)
values
  ('Westmount','QC','free',true,20,45.4834,-73.5966,3.0,true),
  ('Mont-Royal','QC','free',true,30,45.5168,-73.6434,6.0,true),
  ('Hampstead','QC','free',true,40,45.4800,-73.6460,6.5,true),
  ('Côte-Saint-Luc','QC','free',true,50,45.4653,-73.6659,8.0,true),
  ('Montréal-Ouest','QC','free',true,60,45.4529,-73.6493,8.5,true),
  ('Saint-Lambert','QC','free',true,70,45.4992,-73.5082,5.0,true),
  ('Longueuil','QC','free',true,80,45.5312,-73.5181,6.0,true),
  ('Brossard','QC','free',true,90,45.4501,-73.4658,10.0,true),
  ('Dorval','QC','free',true,100,45.4473,-73.7534,15.0,true),
  ('Laval','QC','free',true,110,45.6066,-73.7124,16.0,true),
  ('Boucherville','QC','free',true,120,45.5914,-73.4364,16.5,true),
  ('Pointe-Claire','QC','free',true,130,45.4487,-73.8167,20.0,true)
on conflict (city) do update set
  province = excluded.province,
  pickup_mode = excluded.pickup_mode,
  active = excluded.active,
  sort_order = excluded.sort_order,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  distance_from_montreal_km = excluded.distance_from_montreal_km,
  within_local_radius = excluded.within_local_radius;

-- 3) Harden admin permissions and require MFA for privileged admin access.
alter table public.admin_roles
  add column if not exists can_manage_pickups boolean not null default false,
  add column if not exists can_manage_shipping boolean not null default false,
  add column if not exists can_manage_security boolean not null default false,
  add column if not exists require_mfa boolean not null default true;

update public.admin_roles
set can_manage_pickups = true,
    can_manage_shipping = true,
    can_manage_security = true,
    can_manage_selling_rules = true,
    require_mfa = true,
    updated_at = now()
where role = 'owner';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = auth.uid()
  );
$$;

create or replace function public.admin_access_context()
returns table (
  role text,
  require_mfa boolean,
  has_aal2 boolean,
  can_manage_pickups boolean,
  can_manage_shipping boolean,
  can_manage_security boolean,
  can_manage_selling_rules boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ar.role,
    ar.require_mfa,
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' as has_aal2,
    (ar.role = 'owner' or ar.can_manage_pickups) as can_manage_pickups,
    (ar.role = 'owner' or ar.can_manage_shipping) as can_manage_shipping,
    (ar.role = 'owner' or ar.can_manage_security) as can_manage_security,
    (ar.role = 'owner' or ar.can_manage_selling_rules) as can_manage_selling_rules
  from public.admin_roles ar
  where ar.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.admin_access_context() from public;
grant execute on function public.admin_access_context() to authenticated;

-- 4) Pickup reminder controls and queued reminder jobs.
create table if not exists public.pickup_reminder_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  first_offset_minutes integer not null default 1440 check (first_offset_minutes between 1 and 10080),
  second_offset_minutes integer not null default 180 check (second_offset_minutes between 1 and 10080),
  channel text not null default 'sms' check (channel in ('sms','email','sms_email')),
  allow_email_fallback boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.pickup_reminder_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.pickup_reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  collection_request_id uuid not null references public.collection_requests(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('first','second')),
  scheduled_at timestamptz not null,
  channel text not null check (channel in ('sms','email','sms_email')),
  status text not null default 'pending' check (status in ('pending','processing','sent','cancelled','failed')),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_request_id, reminder_kind)
);

create index if not exists pickup_reminder_jobs_due_idx
  on public.pickup_reminder_jobs (status, scheduled_at);

create or replace function private.schedule_collection_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.pickup_reminder_settings%rowtype;
  first_at timestamptz;
  second_at timestamptz;
begin
  select * into settings
  from public.pickup_reminder_settings
  where singleton = true;

  if not found or not settings.enabled or new.scheduled_window_start is null then
    return new;
  end if;

  first_at := greatest(now(), new.scheduled_window_start - make_interval(mins => settings.first_offset_minutes));
  second_at := greatest(now(), new.scheduled_window_start - make_interval(mins => settings.second_offset_minutes));

  insert into public.pickup_reminder_jobs (collection_request_id, reminder_kind, scheduled_at, channel, status)
  values (new.id, 'first', first_at, settings.channel, 'pending')
  on conflict (collection_request_id, reminder_kind)
  do update set scheduled_at = excluded.scheduled_at, channel = excluded.channel, status = 'pending', sent_at = null, last_error = null, updated_at = now();

  insert into public.pickup_reminder_jobs (collection_request_id, reminder_kind, scheduled_at, channel, status)
  values (new.id, 'second', second_at, settings.channel, 'pending')
  on conflict (collection_request_id, reminder_kind)
  do update set scheduled_at = excluded.scheduled_at, channel = excluded.channel, status = 'pending', sent_at = null, last_error = null, updated_at = now();

  return new;
end;
$$;

revoke all on function private.schedule_collection_reminders() from public, anon, authenticated;

drop trigger if exists collection_requests_schedule_reminders on public.collection_requests;
create trigger collection_requests_schedule_reminders
after insert or update of scheduled_window_start
on public.collection_requests
for each row execute function private.schedule_collection_reminders();

-- Cancel pending reminder jobs when a request is cancelled.
create or replace function private.cancel_collection_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' or new.confirmation_status = 'cancelled' then
    update public.pickup_reminder_jobs
    set status = 'cancelled', updated_at = now()
    where collection_request_id = new.id and status in ('pending','processing');
  end if;
  return new;
end;
$$;

drop trigger if exists collection_requests_cancel_reminders on public.collection_requests;
create trigger collection_requests_cancel_reminders
after update of status, confirmation_status
on public.collection_requests
for each row execute function private.cancel_collection_reminders();

-- 5) Canada-wide shopping and local free-delivery settings.
create table if not exists public.shipping_settings (
  singleton boolean primary key default true check (singleton),
  canada_wide_enabled boolean not null default true,
  local_center_name text not null default 'Montréal',
  local_center_latitude double precision not null default 45.5017,
  local_center_longitude double precision not null default -73.5673,
  local_free_radius_km numeric(6,2) not null default 20 check (local_free_radius_km > 0),
  nonlocal_fee_mode text not null default 'carrier_quote' check (nonlocal_fee_mode in ('carrier_quote','flat_fee')),
  nonlocal_flat_fee_cents integer check (nonlocal_flat_fee_cents is null or nonlocal_flat_fee_cents >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.shipping_settings (singleton)
values (true)
on conflict (singleton) do nothing;

-- 6) Admin logistics RPCs. All writes require an admin role + AAL2 when MFA is required.
create or replace function private.assert_admin_permission(permission_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ar public.admin_roles%rowtype;
  aal text;
begin
  select * into ar from public.admin_roles where user_id = auth.uid();
  if not found then
    raise exception 'admin access required';
  end if;

  aal := coalesce(auth.jwt() ->> 'aal', 'aal1');
  if ar.require_mfa and aal <> 'aal2' then
    raise exception 'aal2 mfa required';
  end if;

  if ar.role = 'owner' then
    return;
  end if;

  if permission_name = 'pickups' and ar.can_manage_pickups then return; end if;
  if permission_name = 'shipping' and ar.can_manage_shipping then return; end if;
  if permission_name = 'security' and ar.can_manage_security then return; end if;
  if permission_name = 'selling_rules' and ar.can_manage_selling_rules then return; end if;

  raise exception 'admin permission denied';
end;
$$;

revoke all on function private.assert_admin_permission(text) from public, anon, authenticated;

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
    'serviceAreas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.city) from public.service_areas a), '[]'::jsonb),
    'pickupSlots', coalesce((select jsonb_agg(to_jsonb(s) order by s.window_start) from public.pickup_slots s where s.window_start >= now() - interval '1 day'), '[]'::jsonb),
    'reminderSettings', (select to_jsonb(r) from public.pickup_reminder_settings r where singleton = true),
    'reminderJobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.scheduled_at desc) from public.pickup_reminder_jobs j where j.scheduled_at >= now() - interval '7 days' limit 100), '[]'::jsonb),
    'shippingSettings', (select to_jsonb(sh) from public.shipping_settings sh where singleton = true)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_operations_snapshot() from public;
grant execute on function public.admin_operations_snapshot() to authenticated;

create or replace function public.admin_create_pickup_slot(
  p_service_area_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_capacity integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform private.assert_admin_permission('pickups');
  if p_window_start <= now() or p_window_end <= p_window_start or p_capacity < 1 or p_capacity > 100 then
    raise exception 'invalid pickup slot';
  end if;
  if not exists (select 1 from public.service_areas where id = p_service_area_id and active) then
    raise exception 'service area is unavailable';
  end if;
  insert into public.pickup_slots (service_area_id, window_start, window_end, capacity, active)
  values (p_service_area_id, p_window_start, p_window_end, p_capacity, true)
  returning id into new_id;

  insert into public.audit_logs (admin_user_id, action, entity_type, entity_id, new_value, reason)
  values (auth.uid(), 'pickup_slot_created', 'pickup_slot', new_id::text,
    jsonb_build_object('service_area_id',p_service_area_id,'window_start',p_window_start,'window_end',p_window_end,'capacity',p_capacity),
    'Created from Admin Pickup Scheduler');
  return new_id;
end;
$$;

create or replace function public.admin_set_pickup_slot_active(p_slot_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_permission('pickups');
  update public.pickup_slots set active = p_active, updated_at = now() where id = p_slot_id;
  if not found then raise exception 'pickup slot not found'; end if;
  insert into public.audit_logs (admin_user_id, action, entity_type, entity_id, new_value, reason)
  values (auth.uid(), 'pickup_slot_status_changed', 'pickup_slot', p_slot_id::text, jsonb_build_object('active',p_active), 'Admin Pickup Scheduler');
end;
$$;

create or replace function public.admin_set_service_area_active(p_area_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_permission('pickups');
  update public.service_areas set active = p_active, updated_at = now() where id = p_area_id;
  if not found then raise exception 'service area not found'; end if;
  insert into public.audit_logs (admin_user_id, action, entity_type, entity_id, new_value, reason)
  values (auth.uid(), 'service_area_status_changed', 'service_area', p_area_id::text, jsonb_build_object('active',p_active), 'Admin Operations');
end;
$$;

create or replace function public.admin_update_pickup_reminder_settings(
  p_enabled boolean,
  p_first_offset_minutes integer,
  p_second_offset_minutes integer,
  p_channel text,
  p_allow_email_fallback boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare old_value jsonb; new_value jsonb;
begin
  perform private.assert_admin_permission('pickups');
  if p_first_offset_minutes < 1 or p_second_offset_minutes < 1 or p_channel not in ('sms','email','sms_email') then
    raise exception 'invalid reminder settings';
  end if;
  select to_jsonb(r) into old_value from public.pickup_reminder_settings r where singleton = true;
  update public.pickup_reminder_settings
  set enabled=p_enabled, first_offset_minutes=p_first_offset_minutes, second_offset_minutes=p_second_offset_minutes,
      channel=p_channel, allow_email_fallback=p_allow_email_fallback, updated_by=auth.uid(), updated_at=now()
  where singleton=true
  returning to_jsonb(pickup_reminder_settings.*) into new_value;
  insert into public.audit_logs (admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason)
  values (auth.uid(),'pickup_reminder_settings_changed','pickup_reminder_settings','singleton',old_value,new_value,'Admin Operations');
end;
$$;

create or replace function public.admin_update_shipping_settings(
  p_local_free_radius_km numeric,
  p_nonlocal_fee_mode text,
  p_nonlocal_flat_fee_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare old_value jsonb; new_value jsonb;
begin
  perform private.assert_admin_permission('shipping');
  if p_local_free_radius_km <= 0 or p_local_free_radius_km > 200 or p_nonlocal_fee_mode not in ('carrier_quote','flat_fee') then
    raise exception 'invalid shipping settings';
  end if;
  if p_nonlocal_fee_mode='flat_fee' and (p_nonlocal_flat_fee_cents is null or p_nonlocal_flat_fee_cents < 0) then
    raise exception 'flat shipping fee required';
  end if;
  select to_jsonb(s) into old_value from public.shipping_settings s where singleton=true;
  update public.shipping_settings
  set local_free_radius_km=p_local_free_radius_km,
      nonlocal_fee_mode=p_nonlocal_fee_mode,
      nonlocal_flat_fee_cents=case when p_nonlocal_fee_mode='flat_fee' then p_nonlocal_flat_fee_cents else null end,
      updated_by=auth.uid(), updated_at=now()
  where singleton=true
  returning to_jsonb(shipping_settings.*) into new_value;
  insert into public.audit_logs (admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason)
  values (auth.uid(),'shipping_settings_changed','shipping_settings','singleton',old_value,new_value,'Admin Operations');
end;
$$;

revoke all on function public.admin_create_pickup_slot(uuid,timestamptz,timestamptz,integer) from public;
grant execute on function public.admin_create_pickup_slot(uuid,timestamptz,timestamptz,integer) to authenticated;
revoke all on function public.admin_set_pickup_slot_active(uuid,boolean) from public;
grant execute on function public.admin_set_pickup_slot_active(uuid,boolean) to authenticated;
revoke all on function public.admin_set_service_area_active(uuid,boolean) from public;
grant execute on function public.admin_set_service_area_active(uuid,boolean) to authenticated;
revoke all on function public.admin_update_pickup_reminder_settings(boolean,integer,integer,text,boolean) from public;
grant execute on function public.admin_update_pickup_reminder_settings(boolean,integer,integer,text,boolean) to authenticated;
revoke all on function public.admin_update_shipping_settings(numeric,text,integer) from public;
grant execute on function public.admin_update_shipping_settings(numeric,text,integer) to authenticated;

-- 7) Customer confirmation/cancellation functions for pickup requests.
create or replace function public.confirm_own_pickup(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.collection_requests
  set confirmation_status='confirmed', pickup_confirmed_at=now(), updated_at=now()
  where id=p_request_id and user_id=auth.uid() and status not in ('cancelled','completed','collected');
  if not found then raise exception 'pickup request unavailable'; end if;
end;
$$;

create or replace function public.cancel_own_pickup(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.collection_requests
  set confirmation_status='cancelled', status='cancelled', updated_at=now()
  where id=p_request_id and user_id=auth.uid() and status not in ('completed','collected');
  if not found then raise exception 'pickup request unavailable'; end if;
end;
$$;

revoke all on function public.confirm_own_pickup(uuid) from public;
grant execute on function public.confirm_own_pickup(uuid) to authenticated;
revoke all on function public.cancel_own_pickup(uuid) from public;
grant execute on function public.cancel_own_pickup(uuid) to authenticated;
