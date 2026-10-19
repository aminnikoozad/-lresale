alter table public.collection_requests add column contact_phone text, add column pickup_address jsonb;
alter table public.collection_requests add constraint collection_pickup_contact_shape check (
 (contact_phone is null or contact_phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$') and
 (pickup_address is null or jsonb_typeof(pickup_address) = 'object')
);
alter table public.pickup_slots add column calendar_managed boolean not null default false;

create or replace function private.enforce_pilot_collection_category()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.pilot_settings%rowtype;
begin
 select * into p from public.pilot_settings where id;
 if found and p.enabled and not (new.category = any(p.categories)) and not
 (new.category='clothing' and array['women','men','kids']::text[] <@ p.categories) then
  raise exception 'This category is not accepting pickup requests during the pilot';
 end if;
 return new;
end; $$;

create or replace function private.reserve_pickup_slot()
returns trigger language plpgsql security definer set search_path='' as $$
declare selected_slot public.pickup_slots%rowtype; p public.pilot_settings%rowtype; local_weekday integer;
begin
 select slot.* into selected_slot from public.pickup_slots slot join public.service_areas area on area.id=slot.service_area_id
 where slot.id=new.pickup_slot_id and slot.service_area_id=new.service_area_id and area.active for update of slot;
 if not found or not selected_slot.active or selected_slot.window_start <= now() or selected_slot.booked_count >= selected_slot.capacity then raise exception 'pickup slot is not available'; end if;
 select * into p from public.pilot_settings where id;
 if found and p.enabled and not selected_slot.calendar_managed then
  local_weekday := extract(dow from (selected_slot.window_start at time zone 'America/Toronto'))::integer;
  if not (local_weekday = any(p.pickup_days)) then raise exception 'This pickup weekday is not available during the pilot'; end if;
 end if;
 new.scheduled_for:=selected_slot.window_start; new.scheduled_window_start:=selected_slot.window_start; new.scheduled_window_end:=selected_slot.window_end;
 update public.pickup_slots set booked_count=booked_count+1 where id=selected_slot.id;
 return new;
end; $$;

create or replace function public.admin_save_pickup_calendar_day(
 p_day date,p_mode text,p_slot_id uuid default null,p_start timestamptz default null,
 p_end timestamptz default null,p_capacity integer default 4,p_active boolean default true
) returns void language plpgsql security definer set search_path='' as $$
declare s public.pickup_slots%rowtype; area_id uuid; start_at timestamptz; end_at timestamptz; result_id uuid;
begin
 perform private.assert_admin_permission('pickups');
 if p_day is null or p_day < (now() at time zone 'America/Toronto')::date or p_day > (now() at time zone 'America/Toronto')::date+730 or p_mode is null or p_mode not in ('open','close','save','add') then raise exception 'invalid calendar day'; end if;
 perform pg_advisory_xact_lock(7420619, (p_day-date '2020-01-01')::integer);
 if p_mode in ('open','close') then
  -- Lock the same rows as the reservation trigger to serialize booking and closing.
  perform 1 from public.pickup_slots where (window_start at time zone 'America/Toronto')::date=p_day for update;
  if exists(select 1 from public.pickup_slots where (window_start at time zone 'America/Toronto')::date=p_day and window_start>now()) then
   update public.pickup_slots set active=(p_mode='open'),calendar_managed=true,updated_at=now()
   where (window_start at time zone 'America/Toronto')::date=p_day and window_start>now();
  elsif p_mode='open' then
   select id into area_id from public.service_areas where active order by sort_order,city limit 1;
   start_at := (p_day+time '10:00') at time zone 'America/Toronto';
   end_at := (p_day+time '14:00') at time zone 'America/Toronto';
   if area_id is null or start_at<=now() then raise exception 'Choose future hours for today'; end if;
   insert into public.pickup_slots(service_area_id,window_start,window_end,capacity,active,calendar_managed) values(area_id,start_at,end_at,4,true,true);
  end if;
 elsif p_mode='save' then
  select * into s from public.pickup_slots where id=p_slot_id for update;
  if not found or (s.window_start at time zone 'America/Toronto')::date<>p_day or s.window_start<=now() then raise exception 'invalid pickup window'; end if;
  if p_capacity is null or p_capacity<greatest(s.booked_count,1) or p_capacity>100 then raise exception 'invalid capacity'; end if;
  start_at:=coalesce(p_start,s.window_start);end_at:=coalesce(p_end,s.window_end);
  if s.booked_count>0 and (start_at<>s.window_start or end_at<>s.window_end) then raise exception 'booked hours cannot change'; end if;
 else
  select id into area_id from public.service_areas where active order by sort_order,city limit 1;
  if area_id is null then raise exception 'no active service area'; end if;
  start_at:=p_start;end_at:=p_end;
 end if;
 if p_mode in ('save','add') then
  if start_at is null or end_at is null or start_at<=now() or end_at<=start_at or
    (start_at at time zone 'America/Toronto')::date<>p_day or (end_at at time zone 'America/Toronto')::date<>p_day or
    p_capacity is null or p_capacity<1 or p_capacity>100 or p_active is null then raise exception 'invalid pickup hours'; end if;
  if (p_mode='add' or p_active) and exists(select 1 from public.pickup_slots where active and calendar_managed and id is distinct from p_slot_id and window_start<end_at and window_end>start_at) then raise exception 'overlapping pickup times'; end if;
  if p_mode='save' then
   update public.pickup_slots set window_start=start_at,window_end=end_at,capacity=p_capacity,active=p_active,calendar_managed=true,updated_at=now() where id=p_slot_id;
  else
   insert into public.pickup_slots(service_area_id,window_start,window_end,capacity,active,calendar_managed) values(area_id,start_at,end_at,p_capacity,true,true) returning id into result_id;
  end if;
 end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(auth.uid(),'pickup_calendar_updated','pickup_slot',coalesce(p_slot_id::text,result_id::text,p_day::text),jsonb_build_object('day',p_day,'mode',p_mode,'start',start_at,'end',end_at,'capacity',p_capacity),'Admin pickup calendar');
end; $$;
revoke all on function public.admin_save_pickup_calendar_day(date,text,uuid,timestamptz,timestamptz,integer,boolean) from public,anon;
grant execute on function public.admin_save_pickup_calendar_day(date,text,uuid,timestamptz,timestamptz,integer,boolean) to authenticated;

-- Preserve the existing operations snapshot and email implementation, adding the
-- request's contact number without changing unrelated data or delivery settings.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.admin_operations_snapshot()'::regprocedure) into definition;
 if position('''address'',cr.address' in definition)=0 then raise exception 'Unexpected operations snapshot definition'; end if;
 definition:=replace(definition,'''address'',cr.address','''address'',cr.address,''contact_phone'',coalesce(cr.contact_phone,p.phone)');
 execute definition;
 select pg_get_functiondef('private.pickup_email_payload(public.collection_requests)'::regprocedure) into definition;
 if position('coalesce(p.phone,' in definition)=0 then raise exception 'Unexpected pickup email definition'; end if;
 definition:=replace(definition,'coalesce(p.phone,','coalesce(r.contact_phone,p.phone,');
 execute definition;
end; $$;
