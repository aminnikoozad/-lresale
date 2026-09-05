begin;

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  city text not null unique,
  province text not null default 'QC',
  pickup_mode text not null default 'review',
  active boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_area_city_length check (char_length(city) between 2 and 100),
  constraint service_area_province check (province = 'QC'),
  constraint service_area_pickup_mode check (pickup_mode in ('free', 'paid', 'review')),
  constraint service_area_sort_order check (sort_order between 0 and 10000)
);

create table public.pickup_slots (
  id uuid primary key default gen_random_uuid(),
  service_area_id uuid not null references public.service_areas(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  capacity integer not null default 1,
  booked_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_slot_window check (window_end > window_start),
  constraint pickup_slot_capacity check (capacity between 1 and 100),
  constraint pickup_slot_booked_count check (booked_count between 0 and capacity),
  constraint pickup_slot_unique_window unique (service_area_id, window_start, window_end)
);

insert into public.service_areas (city, province, pickup_mode, active, sort_order)
values ('Montréal', 'QC', 'free', true, 10)
on conflict (city) do update
set pickup_mode = excluded.pickup_mode,
    active = excluded.active,
    sort_order = excluded.sort_order;

lock table public.collection_requests in access exclusive mode;

do $$
begin
  if exists (select 1 from public.collection_requests) then
    raise exception 'collection requests must be migrated before pickup scheduling can be enabled';
  end if;
end;
$$;

alter table public.collection_requests
  add column service_area_id uuid references public.service_areas(id),
  add column pickup_slot_id uuid references public.pickup_slots(id);

alter table public.collection_requests
  alter column service_area_id set not null,
  alter column pickup_slot_id set not null;

create index pickup_slots_available_idx
on public.pickup_slots (service_area_id, window_start)
where active;

create trigger service_areas_set_updated_at
before update on public.service_areas
for each row execute function private.set_updated_at();

create trigger pickup_slots_set_updated_at
before update on public.pickup_slots
for each row execute function private.set_updated_at();

create or replace function private.reserve_pickup_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_slot public.pickup_slots%rowtype;
begin
  select slot.*
    into selected_slot
  from public.pickup_slots as slot
  join public.service_areas as area on area.id = slot.service_area_id
  where slot.id = new.pickup_slot_id
    and slot.service_area_id = new.service_area_id
    and area.active
  for update of slot;

  if not found or not selected_slot.active or selected_slot.window_start <= now() or selected_slot.booked_count >= selected_slot.capacity then
    raise exception 'pickup slot is not available';
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

create trigger collection_requests_reserve_slot
before insert on public.collection_requests
for each row execute function private.reserve_pickup_slot();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100), ''),
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'phone_e164', '')), 30), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

alter table public.service_areas enable row level security;
alter table public.pickup_slots enable row level security;
alter table public.service_areas force row level security;
alter table public.pickup_slots force row level security;

create policy service_areas_select_active
on public.service_areas for select
to authenticated
using (active);

create policy pickup_slots_select_available
on public.pickup_slots for select
to authenticated
using (active and window_start > now() and booked_count < capacity);

drop policy if exists collection_requests_insert_own on public.collection_requests;
create policy collection_requests_insert_own
on public.collection_requests for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'submitted'
  and hold_status = 'not_required'
  and confirmation_status = 'pending'
  and exists (
    select 1 from public.service_areas as area
    where area.id = service_area_id and area.active
  )
  and exists (
    select 1 from public.pickup_slots as slot
    where slot.id = pickup_slot_id
      and slot.service_area_id = service_area_id
      and slot.active
      and slot.window_start > now()
      and slot.booked_count < slot.capacity
  )
  and condition_confirmed
  and policy_accepted
  and pickup_policy_accepted
);

revoke all on table public.service_areas from anon, authenticated;
revoke all on table public.pickup_slots from anon, authenticated;
grant select on table public.service_areas to authenticated;
grant select on table public.pickup_slots to authenticated;
grant insert (service_area_id, pickup_slot_id) on table public.collection_requests to authenticated;

commit;
