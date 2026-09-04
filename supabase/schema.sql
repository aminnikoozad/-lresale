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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) between 2 and 100),
  constraint profiles_phone_length check (phone is null or char_length(phone) between 7 and 30),
  constraint profiles_address_length check (address_line1 is null or char_length(address_line1) between 5 and 200),
  constraint profiles_city_length check (city is null or char_length(city) between 2 and 100),
  constraint profiles_province_length check (province is null or char_length(province) between 2 and 50),
  constraint profiles_postal_code_length check (postal_code is null or char_length(postal_code) between 3 and 12)
);

create table public.collection_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null,
  category text not null,
  address text not null,
  estimated_resale_value_cents integer not null,
  status text not null default 'submitted',
  hold_status text not null default 'authorization_required',
  condition_confirmed boolean not null,
  policy_accepted boolean not null,
  hold_terms_accepted boolean not null,
  terms_version text not null default '2026-09-04',
  terms_accepted_at timestamptz not null default now(),
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_request_type check (request_type in ('bag', 'pickup')),
  constraint collection_category check (category in ('clothing', 'electronics')),
  constraint collection_address_length check (char_length(address) between 10 and 500),
  constraint collection_minimum_value check (estimated_resale_value_cents between 10000 and 100000000),
  constraint collection_status check (status in ('submitted', 'confirmed', 'scheduled', 'collected', 'inspection', 'completed', 'cancelled')),
  constraint collection_hold_status check (hold_status in ('authorization_required', 'authorized', 'released', 'captured', 'failed')),
  constraint collection_all_terms_required check (condition_confirmed and policy_accepted and hold_terms_accepted)
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
  constraint wallet_transaction_type check (transaction_type in ('sale_credit', 'purchase_debit', 'payout_debit', 'refund_credit', 'adjustment')),
  constraint wallet_status check (status in ('pending', 'completed', 'reversed')),
  constraint wallet_description_length check (char_length(description) between 2 and 250)
);

create index collection_requests_user_created_idx on public.collection_requests (user_id, created_at desc);
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

create trigger collection_requests_set_updated_at
before update on public.collection_requests
for each row execute function private.set_updated_at();

create trigger items_set_updated_at
before update on public.items
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100), ''))
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
alter table public.collection_requests enable row level security;
alter table public.items enable row level security;
alter table public.wallet_transactions enable row level security;

alter table public.profiles force row level security;
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
  and hold_status = 'authorization_required'
  and condition_confirmed
  and policy_accepted
  and hold_terms_accepted
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
revoke all on table public.collection_requests from anon, authenticated;
revoke all on table public.items from anon, authenticated;
revoke all on table public.wallet_transactions from anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, phone, address_line1, city, province, postal_code) on table public.profiles to authenticated;
grant select on table public.collection_requests to authenticated;
grant insert (user_id, request_type, category, address, estimated_resale_value_cents, condition_confirmed, policy_accepted, hold_terms_accepted) on table public.collection_requests to authenticated;
grant select on table public.items to authenticated;
grant select on table public.wallet_transactions to authenticated;

revoke all on schema private from public, anon, authenticated;
