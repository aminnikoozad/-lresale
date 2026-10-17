-- Public policy read projection. Do not grant anonymous access to the full version JSON.
-- Policy values and table grants are unchanged. Mirror the production private-RPC boundary
-- for fresh databases whose older repository history granted the full JSON to anon.
revoke execute on function public.get_selling_rules() from public, anon;
create or replace function public.get_public_selling_rules()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with current_rules as (select public.get_selling_rules() as v)
  select case when jsonb_typeof(v) = 'object' then jsonb_build_object(
    'minimumIndividualItemValueCents', case when jsonb_typeof(v->'minimumIndividualItemValueCents') = 'number' then v->'minimumIndividualItemValueCents' else 'null'::jsonb end,
    'minimumPickupEstimatedValueCents', case when jsonb_typeof(v->'minimumPickupEstimatedValueCents') = 'number' then v->'minimumPickupEstimatedValueCents' else 'null'::jsonb end,
    'sellingPeriodDays', case when jsonb_typeof(v->'sellingPeriodDays') = 'number' then v->'sellingPeriodDays' else 'null'::jsonb end,
    'minimumSellingPriceCents', case when jsonb_typeof(v->'minimumSellingPriceCents') = 'number' then v->'minimumSellingPriceCents' else 'null'::jsonb end,
    'storeCreditBonusBps', case when jsonb_typeof(v->'storeCreditBonusBps') = 'number' then v->'storeCreditBonusBps' else 'null'::jsonb end,
    'returnPeriodDays', case when jsonb_typeof(v->'returnPeriodDays') = 'number' then v->'returnPeriodDays' else 'null'::jsonb end,
    'highValueThresholdCents', case when jsonb_typeof(v->'highValueThresholdCents') = 'number' then v->'highValueThresholdCents' else 'null'::jsonb end,
    'bundleEligibility', case when jsonb_typeof(v->'bundleEligibility') = 'boolean' then v->'bundleEligibility' else 'null'::jsonb end,
    'commissionTiers', (select coalesce(jsonb_agg(jsonb_build_object('minCents', case when jsonb_typeof(entry->'minCents') = 'number' then entry->'minCents' else 'null'::jsonb end, 'maxCents', case when jsonb_typeof(entry->'maxCents') = 'number' then entry->'maxCents' else 'null'::jsonb end, 'sellerBps', case when jsonb_typeof(entry->'sellerBps') = 'number' then entry->'sellerBps' else 'null'::jsonb end, 'platformBps', case when jsonb_typeof(entry->'platformBps') = 'number' then entry->'platformBps' else 'null'::jsonb end) order by ordinal), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(v->'commissionTiers')='array' then v->'commissionTiers' else '[]'::jsonb end) with ordinality as a(entry,ordinal) where jsonb_typeof(entry)='object'),
    'discountSchedule', (select coalesce(jsonb_agg(jsonb_build_object('startDay', case when jsonb_typeof(entry->'startDay') = 'number' then entry->'startDay' else 'null'::jsonb end, 'discountBps', case when jsonb_typeof(entry->'discountBps') = 'number' then entry->'discountBps' else 'null'::jsonb end) order by ordinal), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(v->'discountSchedule')='array' then v->'discountSchedule' else '[]'::jsonb end) with ordinality as a(entry,ordinal) where jsonb_typeof(entry)='object'),
    'pickupRules', jsonb_build_object(
      'firstMissedPickupFeeCents', case when jsonb_typeof((v->'pickupRules')->'firstMissedPickupFeeCents') = 'number' then (v->'pickupRules')->'firstMissedPickupFeeCents' else 'null'::jsonb end,
      'secondMissedPickupFeeCents', case when jsonb_typeof((v->'pickupRules')->'secondMissedPickupFeeCents') = 'number' then (v->'pickupRules')->'secondMissedPickupFeeCents' else 'null'::jsonb end,
      'suspendFreePickupAfterMisses', case when jsonb_typeof((v->'pickupRules')->'suspendFreePickupAfterMisses') = 'number' then (v->'pickupRules')->'suspendFreePickupAfterMisses' else 'null'::jsonb end,
      'freePickupThresholdCents', case when jsonb_typeof((v->'pickupRules')->'freePickupThresholdCents') = 'number' then (v->'pickupRules')->'freePickupThresholdCents' else 'null'::jsonb end,
      'lowValuePickupItemFeeCents', case when jsonb_typeof((v->'pickupRules')->'lowValuePickupItemFeeCents') = 'number' then (v->'pickupRules')->'lowValuePickupItemFeeCents' else 'null'::jsonb end,
      'bagMinimumEstimatedValueCents', case when jsonb_typeof((v->'pickupRules')->'bagMinimumEstimatedValueCents') = 'number' then (v->'pickupRules')->'bagMinimumEstimatedValueCents' else 'null'::jsonb end,
      'processingFeeCents', case when jsonb_typeof((v->'pickupRules')->'processingFeeCents') = 'number' then (v->'pickupRules')->'processingFeeCents' else 'null'::jsonb end,
      'rewearBagFeeCents', case when jsonb_typeof((v->'pickupRules')->'rewearBagFeeCents') = 'number' then (v->'pickupRules')->'rewearBagFeeCents' else 'null'::jsonb end,
      'confirmationRequired', case when jsonb_typeof((v->'pickupRules')->'confirmationRequired') = 'boolean' then (v->'pickupRules')->'confirmationRequired' else 'null'::jsonb end,
      'priorityPickupAtOrAboveThreshold', case when jsonb_typeof((v->'pickupRules')->'priorityPickupAtOrAboveThreshold') = 'boolean' then (v->'pickupRules')->'priorityPickupAtOrAboveThreshold' else 'null'::jsonb end
    )
  ) else null end
  from current_rules;
$$;

revoke all on function public.get_public_selling_rules() from public;
grant execute on function public.get_public_selling_rules() to anon, authenticated, service_role;
comment on function public.get_public_selling_rules() is
  'Read-only allowlist of public selling terms; excludes unrecognized fields at every nesting level.';
