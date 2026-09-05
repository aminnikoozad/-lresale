-- Rewear customer account schema.
-- Apply to the production Supabase project before deploying app code.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address_line1 text,
  city text,
  province text default 'QC',
  postal_code text,
  missed_pickup_count integer not null default 0,
  free_pickup_status text not null default 'active',
  outstanding_missed_pickup_fee_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) between 2 and 100),
  constraint profiles_phone_length check (phone is null or char_length(phone) between 7 and 30),
  constraint profiles_address_length check (address_line1 is null or char_length(address_line1) between 5 and 200),
  constraint profiles_city_length check (city is null or char_length(city) between 2 and 100),
  constraint profiles_province_length check (province is null or char_length(province) between 2 and 50),
  constraint profiles_postal_code_length check (postal_code is null or char_length(postal_code) between 3 and 12),
  constraint profiles_missed_pickup_count check (missed_pickup_count between 0 and 999),
  constraint profiles_free_pickup_status check (free_pickup_status in ('active', 'suspended')),
  constraint profiles_outstanding_missed_pickup_fee check (outstanding_missed_pickup_fee_cents between 0 and 100000000)
);

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
on conflict (city) do update set pickup_mode = excluded.pickup_mode, active = excluded.active, sort_order = excluded.sort_order;

create table public.collection_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null,
  category text not null,
  address text not null,
  service_area_id uuid not null references public.service_areas(id),
  pickup_slot_id uuid not null references public.pickup_slots(id),
  item_count integer,
  brand_notes text,
  estimated_resale_value_cents integer not null,
  status text not null default 'submitted',
  confirmation_status text not null default 'pending',
  confirmation_deadline timestamptz,
  pickup_confirmed_at timestamptz,
  scheduled_window_start timestamptz,
  scheduled_window_end timestamptz,
  hold_status text not null default 'not_required',
  condition_confirmed boolean not null,
  policy_accepted boolean not null,
  pickup_policy_accepted boolean not null,
  pickup_policy_version text not null default '2026-09-05',
  hold_terms_accepted boolean not null default true,
  terms_version text not null default '2026-09-05',
  terms_accepted_at timestamptz not null default now(),
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_request_type check (request_type in ('bag', 'pickup')),
  constraint collection_category check (category in ('clothing', 'electronics')),
  constraint collection_address_length check (char_length(address) between 10 and 500),
  constraint collection_item_count check (item_count is null or item_count between 1 and 500),
  constraint collection_brand_notes_length check (brand_notes is null or char_length(brand_notes) <= 500),
  constraint collection_minimum_value check (estimated_resale_value_cents between 10000 and 100000000),
  constraint collection_status check (status in ('submitted', 'confirmed', 'scheduled', 'collected', 'inspection', 'completed', 'cancelled', 'missed')),
  constraint collection_confirmation_status check (confirmation_status in ('pending', 'confirmed', 'cancelled', 'reschedule_requested', 'expired')),
  constraint collection_schedule_window check (scheduled_window_end is null or scheduled_window_start is null or scheduled_window_end > scheduled_window_start),
  constraint collection_hold_status check (hold_status in ('not_required', 'authorization_required', 'authorized', 'released', 'captured', 'failed')),
  constraint collection_all_terms_required check (condition_confirmed and policy_accepted and pickup_policy_accepted)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_request_id uuid references public.collection_requests(id) on delete set null,
  name text not null,
  brand text,
  category text not null,
  status text not null default 'received',
  listed_price_cents integer,
  sold_price_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_name_length check (char_length(name) between 2 and 160),
  constraint items_brand_length check (brand is null or char_length(brand) between 1 and 100),
  constraint items_category check (category in ('women', 'men', 'kids', 'electronics', 'shoes', 'accessories')),
  constraint items_status check (status in ('received', 'inspection', 'accepted', 'rejected', 'listed', 'sold', 'return_requested', 'returned', 'donated', 'auctioned')),
  constraint items_listed_price check (listed_price_cents is null or listed_price_cents between 0 and 100000000),
  constraint items_sold_price check (sold_price_cents is null or sold_price_cents between 0 and 100000000)
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null,
  transaction_type text not null,
  status text not null default 'pending',
  description text not null,
  item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint wallet_nonzero_amount check (amount_cents <> 0 and amount_cents between -100000000 and 100000000),
  constraint wallet_transaction_type check (transaction_type in ('sale_credit', 'purchase_debit', 'payout_debit', 'refund_credit', 'adjustment', 'missed_pickup_fee')),
  constraint wallet_status check (status in ('pending', 'completed', 'reversed')),
  constraint wallet_description_length check (char_length(description) between 2 and 250)
);

create index collection_requests_user_created_idx on public.collection_requests (user_id, created_at desc);
create index collection_requests_service_area_idx on public.collection_requests (service_area_id);
create index collection_requests_pickup_slot_idx on public.collection_requests (pickup_slot_id);
create index pickup_slots_available_idx on public.pickup_slots (service_area_id, window_start) where active;
create index items_owner_created_idx on public.items (owner_id, created_at desc);
create index items_collection_request_idx on public.items (collection_request_id);
create index wallet_transactions_user_created_idx on public.wallet_transactions (user_id, created_at desc);
create index wallet_transactions_item_idx on public.wallet_transactions (item_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger service_areas_set_updated_at
before update on public.service_areas
for each row execute function private.set_updated_at();

create trigger pickup_slots_set_updated_at
before update on public.pickup_slots
for each row execute function private.set_updated_at();

create trigger collection_requests_set_updated_at
before update on public.collection_requests
for each row execute function private.set_updated_at();

create trigger items_set_updated_at
before update on public.items
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

  update public.pickup_slots set booked_count = booked_count + 1 where id = selected_slot.id;
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
revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.service_areas enable row level security;
alter table public.pickup_slots enable row level security;
alter table public.collection_requests enable row level security;
alter table public.items enable row level security;
alter table public.wallet_transactions enable row level security;

alter table public.profiles force row level security;
alter table public.service_areas force row level security;
alter table public.pickup_slots force row level security;
alter table public.collection_requests force row level security;
alter table public.items force row level security;
alter table public.wallet_transactions force row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy service_areas_select_active
on public.service_areas for select
to authenticated
using (active);

create policy pickup_slots_select_available
on public.pickup_slots for select
to authenticated
using (active and window_start > now() and booked_count < capacity);

create policy collection_requests_select_own
on public.collection_requests for select
to authenticated
using ((select auth.uid()) = user_id);

create policy collection_requests_insert_own
on public.collection_requests for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'submitted'
  and hold_status = 'not_required'
  and confirmation_status = 'pending'
  and exists (select 1 from public.service_areas as area where area.id = service_area_id and area.active)
  and exists (select 1 from public.pickup_slots as slot where slot.id = pickup_slot_id and slot.service_area_id = service_area_id and slot.active and slot.window_start > now() and slot.booked_count < slot.capacity)
  and condition_confirmed
  and policy_accepted
  and pickup_policy_accepted
);

create policy items_select_own
on public.items for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy wallet_transactions_select_own
on public.wallet_transactions for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.service_areas from anon, authenticated;
revoke all on table public.pickup_slots from anon, authenticated;
revoke all on table public.collection_requests from anon, authenticated;
revoke all on table public.items from anon, authenticated;
revoke all on table public.wallet_transactions from anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.service_areas to authenticated;
grant select on table public.pickup_slots to authenticated;
grant update (full_name, phone, address_line1, city, province, postal_code) on table public.profiles to authenticated;
grant select on table public.collection_requests to authenticated;
grant insert (user_id, request_type, category, address, service_area_id, pickup_slot_id, item_count, brand_notes, estimated_resale_value_cents, condition_confirmed, policy_accepted, pickup_policy_accepted) on table public.collection_requests to authenticated;
grant select on table public.items to authenticated;
grant select on table public.wallet_transactions to authenticated;

revoke all on schema private from public, anon, authenticated;
