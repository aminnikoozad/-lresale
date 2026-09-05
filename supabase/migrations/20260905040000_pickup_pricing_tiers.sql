-- Pickup pricing policy:
-- - estimated resale value >= $100: free, priority pickup
-- - estimated resale value < $100: $5 per item pickup fee
-- - Bag / Box requests require at least $100 estimated resale value
-- Values are stored in the versioned selling_rules setting and enforced server-side.

alter table public.collection_requests
  add column if not exists pickup_fee_cents integer not null default 0,
  add column if not exists pickup_pricing_mode text not null default 'free_priority',
  add column if not exists priority_pickup boolean not null default false;

alter table public.collection_requests
  drop constraint if exists collection_pickup_fee_nonnegative,
  add constraint collection_pickup_fee_nonnegative check (pickup_fee_cents >= 0),
  drop constraint if exists collection_pickup_pricing_mode,
  add constraint collection_pickup_pricing_mode check (
    pickup_pricing_mode = any (array['free_priority'::text, 'paid_per_item'::text])
  );

create index if not exists collection_requests_priority_idx
  on public.collection_requests (priority_pickup, status, created_at desc);

create or replace function private.apply_collection_pickup_pricing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb;
  pickup_rules jsonb;
  free_threshold integer;
  per_item_fee integer;
  bag_minimum integer;
  priority_enabled boolean;
begin
  rules := public.get_selling_rules();
  pickup_rules := coalesce(rules -> 'pickupRules', '{}'::jsonb);

  free_threshold := greatest(
    1,
    coalesce((pickup_rules ->> 'freePickupThresholdCents')::integer, 10000)
  );
  per_item_fee := greatest(
    0,
    coalesce((pickup_rules ->> 'lowValuePickupItemFeeCents')::integer, 500)
  );
  bag_minimum := greatest(
    1,
    coalesce((pickup_rules ->> 'bagMinimumEstimatedValueCents')::integer, 10000)
  );
  priority_enabled := coalesce(
    (pickup_rules ->> 'priorityPickupAtOrAboveThreshold')::boolean,
    true
  );

  if new.item_count is null or new.item_count < 1 then
    raise exception 'A valid item count is required for pickup pricing.';
  end if;

  if new.request_type = 'bag' and new.estimated_resale_value_cents < bag_minimum then
    raise exception 'Bag or Box requests require at least % cents in estimated resale value.', bag_minimum;
  end if;

  if new.estimated_resale_value_cents >= free_threshold then
    new.pickup_fee_cents := 0;
    new.pickup_pricing_mode := 'free_priority';
    new.priority_pickup := priority_enabled;
  else
    new.pickup_fee_cents := new.item_count * per_item_fee;
    new.pickup_pricing_mode := 'paid_per_item';
    new.priority_pickup := false;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_collection_pickup_pricing() from public, anon, authenticated;

drop trigger if exists collection_requests_apply_pickup_pricing on public.collection_requests;
create trigger collection_requests_apply_pickup_pricing
before insert or update of request_type, estimated_resale_value_cents, item_count
on public.collection_requests
for each row execute function private.apply_collection_pickup_pricing();

-- Publish a new, effective selling-rules version rather than mutating the old one.
with latest as (
  select value
  from public.business_setting_versions
  where setting_key = 'selling_rules'
  order by version desc
  limit 1
), next_version as (
  select coalesce(max(version), 0) + 1 as version
  from public.business_setting_versions
  where setting_key = 'selling_rules'
), proposed as (
  select
    coalesce(latest.value, '{}'::jsonb)
    || jsonb_build_object(
      'minimumPickupEstimatedValueCents', 1,
      'pickupRules',
        coalesce(latest.value -> 'pickupRules', '{}'::jsonb)
        || jsonb_build_object(
          'freePickupThresholdCents', 10000,
          'lowValuePickupItemFeeCents', 500,
          'bagMinimumEstimatedValueCents', 10000,
          'priorityPickupAtOrAboveThreshold', true
        )
    ) as value
  from latest
)
insert into public.business_setting_versions (
  setting_key,
  version,
  value,
  effective_at,
  created_by,
  reason
)
select
  'selling_rules',
  next_version.version,
  proposed.value,
  now(),
  null,
  'Pickup policy: $100+ free priority pickup; below $100 costs $5 per item; Bag/Box requests require $100+'
from next_version, proposed;

-- Normalize existing requests using the newly published rule.
update public.collection_requests
set
  pickup_fee_cents = case
    when estimated_resale_value_cents >= 10000 then 0
    else coalesce(item_count, 0) * 500
  end,
  pickup_pricing_mode = case
    when estimated_resale_value_cents >= 10000 then 'free_priority'
    else 'paid_per_item'
  end,
  priority_pickup = estimated_resale_value_cents >= 10000;

insert into public.audit_logs (
  admin_user_id,
  action,
  entity_type,
  entity_id,
  previous_value,
  new_value,
  reason
)
select
  null,
  'selling_rules_updated',
  'business_setting',
  'selling_rules',
  previous.value,
  current.value,
  'Changed pickup policy to free priority at $100+, $5 per item below $100, and $100 minimum for Bag/Box requests.'
from (
  select value
  from public.business_setting_versions
  where setting_key = 'selling_rules'
  order by version desc
  offset 1 limit 1
) previous
cross join (
  select value
  from public.business_setting_versions
  where setting_key = 'selling_rules'
  order by version desc
  limit 1
) current;
