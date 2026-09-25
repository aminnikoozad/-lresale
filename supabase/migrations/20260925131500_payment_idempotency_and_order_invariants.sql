alter table public.orders
  drop constraint if exists orders_total_components_check,
  drop constraint if exists orders_paid_requires_payment_evidence_check;

alter table public.orders
  add constraint orders_total_components_check
    check (total_cents is null or total_cents = subtotal_cents + coalesce(shipping_cents,0) + coalesce(tax_cents,0)),
  add constraint orders_paid_requires_payment_evidence_check
    check (
      payment_status <> 'paid'
      or (
        payment_provider is not null
        and provider_payment_id is not null
        and paid_at is not null
        and tax_cents is not null
        and total_cents is not null
        and buyer_terms_accepted_at is not null
        and buyer_terms_version is not null
        and return_policy_version is not null
        and privacy_notice_version is not null
      )
    );

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 2 and 40),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 255),
  event_type text not null check (char_length(event_type) between 1 and 120),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  order_id uuid references public.orders(id) on delete restrict,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  processing_attempts integer not null default 0 check (processing_attempts between 0 and 50),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 120),
  unique(provider, provider_event_id)
);

create index if not exists payment_webhook_events_order_idx on public.payment_webhook_events(order_id);
create index if not exists payment_webhook_events_pending_idx on public.payment_webhook_events(received_at) where status in ('received','failed');

alter table public.payment_webhook_events enable row level security;
revoke all on table public.payment_webhook_events from public, anon, authenticated;
grant select, insert, update on table public.payment_webhook_events to service_role;

create table if not exists public.order_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (char_length(provider) between 2 and 40),
  provider_checkout_id text check (provider_checkout_id is null or char_length(provider_checkout_id) between 1 and 255),
  idempotency_key uuid not null default gen_random_uuid(),
  expected_total_cents integer not null check (expected_total_cents > 0),
  currency text not null default 'CAD' check (currency='CAD'),
  status text not null default 'created' check (status in ('created','pending','succeeded','failed','cancelled','expired','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(idempotency_key),
  unique(provider, provider_checkout_id)
);

create index if not exists order_payment_attempts_order_idx on public.order_payment_attempts(order_id, created_at desc);
create index if not exists order_payment_attempts_buyer_idx on public.order_payment_attempts(buyer_id, created_at desc);

alter table public.order_payment_attempts enable row level security;
revoke all on table public.order_payment_attempts from public, anon, authenticated;
grant select, insert, update on table public.order_payment_attempts to service_role;
