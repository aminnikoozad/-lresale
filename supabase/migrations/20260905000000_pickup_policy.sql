begin;

alter table public.profiles
  add column if not exists missed_pickup_count integer not null default 0,
  add column if not exists free_pickup_status text not null default 'active',
  add column if not exists outstanding_missed_pickup_fee_cents integer not null default 0;

alter table public.profiles
  drop constraint if exists profiles_missed_pickup_count,
  drop constraint if exists profiles_free_pickup_status,
  drop constraint if exists profiles_outstanding_missed_pickup_fee;

alter table public.profiles
  add constraint profiles_missed_pickup_count check (missed_pickup_count between 0 and 999),
  add constraint profiles_free_pickup_status check (free_pickup_status in ('active', 'suspended')),
  add constraint profiles_outstanding_missed_pickup_fee check (outstanding_missed_pickup_fee_cents between 0 and 100000000);

alter table public.collection_requests
  add column if not exists item_count integer,
  add column if not exists brand_notes text,
  add column if not exists confirmation_status text not null default 'pending',
  add column if not exists confirmation_deadline timestamptz,
  add column if not exists pickup_confirmed_at timestamptz,
  add column if not exists scheduled_window_start timestamptz,
  add column if not exists scheduled_window_end timestamptz,
  add column if not exists pickup_policy_accepted boolean not null default false,
  add column if not exists pickup_policy_version text not null default '2026-09-05';

alter table public.collection_requests
  alter column hold_status set default 'not_required',
  alter column hold_terms_accepted set default true,
  alter column terms_version set default '2026-09-05';

alter table public.collection_requests
  drop constraint if exists collection_item_count,
  drop constraint if exists collection_brand_notes_length,
  drop constraint if exists collection_status,
  drop constraint if exists collection_confirmation_status,
  drop constraint if exists collection_schedule_window,
  drop constraint if exists collection_hold_status,
  drop constraint if exists collection_all_terms_required;

alter table public.collection_requests
  add constraint collection_item_count check (item_count is null or item_count between 1 and 500),
  add constraint collection_brand_notes_length check (brand_notes is null or char_length(brand_notes) <= 500),
  add constraint collection_status check (status in ('submitted', 'confirmed', 'scheduled', 'collected', 'inspection', 'completed', 'cancelled', 'missed')),
  add constraint collection_confirmation_status check (confirmation_status in ('pending', 'confirmed', 'cancelled', 'reschedule_requested', 'expired')),
  add constraint collection_schedule_window check (scheduled_window_end is null or scheduled_window_start is null or scheduled_window_end > scheduled_window_start),
  add constraint collection_hold_status check (hold_status in ('not_required', 'authorization_required', 'authorized', 'released', 'captured', 'failed')),
  add constraint collection_all_terms_required check (condition_confirmed and policy_accepted and pickup_policy_accepted);

alter table public.wallet_transactions
  drop constraint if exists wallet_transaction_type;

alter table public.wallet_transactions
  add constraint wallet_transaction_type check (transaction_type in ('sale_credit', 'purchase_debit', 'payout_debit', 'refund_credit', 'adjustment', 'missed_pickup_fee'));

drop policy if exists collection_requests_insert_own on public.collection_requests;
create policy collection_requests_insert_own
on public.collection_requests for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'submitted'
  and hold_status = 'not_required'
  and confirmation_status = 'pending'
  and condition_confirmed
  and policy_accepted
  and pickup_policy_accepted
);

grant insert (item_count, brand_notes, pickup_policy_accepted) on table public.collection_requests to authenticated;

commit;
