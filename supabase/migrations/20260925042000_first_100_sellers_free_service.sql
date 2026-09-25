begin;

create table if not exists public.seller_promotion_state (
  campaign_key text primary key,
  max_claims integer not null check (max_claims > 0),
  claimed_count integer not null default 0 check (claimed_count >= 0),
  active boolean not null default true,
  waived_service_fee_cents integer not null default 0 check (waived_service_fee_cents >= 0),
  created_at timestamptz not null default now(),
  exhausted_at timestamptz,
  constraint seller_promotion_claim_count_valid check (claimed_count <= max_claims)
);

alter table public.seller_promotion_state enable row level security;

revoke all on table public.seller_promotion_state from public, anon, authenticated;
grant select on table public.seller_promotion_state to anon, authenticated;

drop policy if exists seller_promotion_state_public_read on public.seller_promotion_state;
create policy seller_promotion_state_public_read
on public.seller_promotion_state
for select
to anon, authenticated
using (true);

create table if not exists private.seller_promotion_claims (
  campaign_key text not null references public.seller_promotion_state(campaign_key),
  user_id uuid not null,
  request_id uuid not null,
  claim_number integer not null check (claim_number > 0),
  claimed_at timestamptz not null default now(),
  primary key (campaign_key, user_id),
  unique (campaign_key, claim_number),
  unique (request_id)
);

alter table public.collection_requests
  add column if not exists promotion_code text,
  add column if not exists promotion_claim_number integer,
  add column if not exists service_fee_waived_cents integer not null default 0;

alter table public.collection_requests
  drop constraint if exists collection_requests_promotion_consistency;

alter table public.collection_requests
  add constraint collection_requests_promotion_consistency
  check (
    (
      promotion_code is null
      and promotion_claim_number is null
      and service_fee_waived_cents = 0
    )
    or
    (
      promotion_code is not null
      and promotion_claim_number is not null
      and promotion_claim_number > 0
      and service_fee_waived_cents > 0
    )
  );

insert into public.seller_promotion_state (
  campaign_key,
  max_claims,
  claimed_count,
  active,
  waived_service_fee_cents
)
values (
  'launch_first_100_sellers',
  100,
  0,
  true,
  1200
)
on conflict (campaign_key) do nothing;

create or replace function private.apply_collection_service_fees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb;
  pickup_rules jsonb;
  service_fee integer;
  campaign public.seller_promotion_state%rowtype;
  next_claim integer;
  inserted_claim integer;
begin
  rules := public.get_selling_rules();
  pickup_rules := coalesce(rules -> 'pickupRules', '{}'::jsonb);
  service_fee := greatest(0, coalesce((pickup_rules ->> 'processingFeeCents')::integer, 1200));

  -- Server-controlled fee snapshot. Ignore any client-supplied promotion fields.
  new.processing_fee_cents := service_fee;
  new.bag_fee_cents := 0;
  new.promotion_code := null;
  new.promotion_claim_number := null;
  new.service_fee_waived_cents := 0;

  if service_fee <= 0 then
    return new;
  end if;

  -- Serialize claims so the campaign cannot exceed exactly 100 successful
  -- first collection requests even under concurrent submissions.
  select *
  into campaign
  from public.seller_promotion_state
  where campaign_key = 'launch_first_100_sellers'
  for update;

  if not found or not campaign.active or campaign.claimed_count >= campaign.max_claims then
    return new;
  end if;

  -- Account creation does not count. Only a seller with no prior successful
  -- collection request is eligible, and each seller can claim at most once.
  if exists (
    select 1
    from public.collection_requests existing
    where existing.user_id = new.user_id
  ) then
    return new;
  end if;

  next_claim := campaign.claimed_count + 1;

  insert into private.seller_promotion_claims (
    campaign_key,
    user_id,
    request_id,
    claim_number
  )
  values (
    campaign.campaign_key,
    new.user_id,
    new.id,
    next_claim
  )
  on conflict (campaign_key, user_id) do nothing
  returning claim_number into inserted_claim;

  if inserted_claim is null then
    return new;
  end if;

  new.processing_fee_cents := 0;
  new.promotion_code := campaign.campaign_key;
  new.promotion_claim_number := inserted_claim;
  new.service_fee_waived_cents := service_fee;

  update public.seller_promotion_state
  set claimed_count = inserted_claim,
      active = inserted_claim < max_claims,
      exhausted_at = case
        when inserted_claim >= max_claims then coalesce(exhausted_at, now())
        else exhausted_at
      end
  where campaign_key = campaign.campaign_key;

  return new;
end;
$$;

revoke all on function private.apply_collection_service_fees() from public, anon, authenticated;

commit;
