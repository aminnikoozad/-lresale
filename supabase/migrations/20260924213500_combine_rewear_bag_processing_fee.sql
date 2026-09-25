begin;

-- REWEAR uses one $12 batch service fee. A REWEAR Bag, when requested,
-- is included in that fee and never creates a second Bag charge.
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
begin
  rules := public.get_selling_rules();
  pickup_rules := coalesce(rules -> 'pickupRules', '{}'::jsonb);
  service_fee := greatest(0, coalesce((pickup_rules ->> 'processingFeeCents')::integer, 1200));

  new.processing_fee_cents := service_fee;
  new.bag_fee_cents := 0;
  return new;
end;
$$;

revoke all on function private.apply_collection_service_fees() from public, anon, authenticated;

-- This corrects the just-introduced split-fee policy. It only removes a Bag
-- charge; it never increases an existing seller obligation.
update public.collection_requests
set bag_fee_cents = 0
where bag_fee_cents <> 0;

-- Publish the corrected rule while preserving every unrelated selling rule.
with latest as (
  select value
  from public.business_setting_versions
  where setting_key = 'selling_rules'
    and effective_at <= now()
  order by effective_at desc, version desc
  limit 1
), next_version as (
  select coalesce(max(version), 0) + 1 as version
  from public.business_setting_versions
  where setting_key = 'selling_rules'
), proposed as (
  select
    coalesce(latest.value, '{}'::jsonb)
    || jsonb_build_object(
      'pickupRules',
      coalesce(latest.value -> 'pickupRules', '{}'::jsonb)
      || jsonb_build_object(
        'processingFeeCents', 1200,
        'rewearBagFeeCents', 0
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
  'Corrected intake pricing: one $12 batch service fee total; REWEAR Bag is included with no separate Bag fee.'
from next_version, proposed;

commit;
