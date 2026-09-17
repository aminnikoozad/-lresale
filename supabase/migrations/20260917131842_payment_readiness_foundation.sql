alter table public.orders
  add column if not exists currency text not null default 'CAD' check (currency = 'CAD'),
  add column if not exists tax_cents integer check (tax_cents is null or tax_cents >= 0),
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists payment_provider text check (payment_provider is null or char_length(payment_provider) between 2 and 40),
  add column if not exists provider_checkout_id text,
  add column if not exists provider_payment_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists checkout_token uuid not null default gen_random_uuid();

create unique index if not exists orders_checkout_token_uidx
  on public.orders(checkout_token);

create unique index if not exists orders_provider_checkout_uidx
  on public.orders(payment_provider, provider_checkout_id)
  where provider_checkout_id is not null;

create unique index if not exists orders_provider_payment_uidx
  on public.orders(payment_provider, provider_payment_id)
  where provider_payment_id is not null;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  buyer_id uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('active','released','converted','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_reservations enable row level security;

revoke all on table public.inventory_reservations from public, anon, authenticated;
grant select on table public.inventory_reservations to authenticated;
grant select, insert, update, delete on table public.inventory_reservations to service_role;

drop policy if exists inventory_reservations_buyer_select_own on public.inventory_reservations;
create policy inventory_reservations_buyer_select_own
on public.inventory_reservations
for select
to authenticated
using ((select auth.uid()) = buyer_id);

create unique index if not exists inventory_reservations_one_active_item_uidx
  on public.inventory_reservations(item_id)
  where status = 'active';

create index if not exists inventory_reservations_order_idx
  on public.inventory_reservations(order_id);

create index if not exists inventory_reservations_buyer_idx
  on public.inventory_reservations(buyer_id, created_at desc);

create index if not exists inventory_reservations_expiry_idx
  on public.inventory_reservations(expires_at)
  where status = 'active';
