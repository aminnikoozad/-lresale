-- New intake minimums. Preserve the active commission percentages and every other setting.
-- A new version ensures existing approved item commission snapshots and batch fees stay untouched.
do $$
declare
  current_rules jsonb;
  updated_rules jsonb;
  first_tier jsonb;
  next_version integer;
begin
  current_rules := public.get_selling_rules();
  first_tier := current_rules->'commissionTiers'->0;
  if first_tier is null or (first_tier->>'maxCents')::integer < 800 then
    raise exception 'Review the active commission tiers before changing the item minimum';
  end if;

  updated_rules := jsonb_set(current_rules, '{minimumIndividualItemValueCents}', '800'::jsonb);
  updated_rules := jsonb_set(updated_rules, '{minimumPickupEstimatedValueCents}', '6000'::jsonb);
  updated_rules := jsonb_set(updated_rules, '{commissionTiers,0,minCents}', '800'::jsonb);
  -- Discounts must not have a floor above a newly admitted item's initial price.
  updated_rules := jsonb_set(updated_rules, '{minimumSellingPriceCents}',
    to_jsonb(least(coalesce((current_rules->>'minimumSellingPriceCents')::integer,800),800)));
  updated_rules := jsonb_set(updated_rules, '{pickupRules,bagMinimumEstimatedValueCents}', '6000'::jsonb, true);

  select coalesce(max(version),0)+1 into next_version
  from public.business_setting_versions where setting_key='selling_rules';
  insert into public.business_setting_versions(setting_key,version,value,effective_at,reason)
  values ('selling_rules',next_version,updated_rules,clock_timestamp(),
    'Owner policy: $8 individual item, $60 estimated collection and Bag minimum; physical inspection required');
end $$;

-- Replace previously approved static answers that would contradict the live policy.
update public.knowledge_base
set approved_answer=case title
  when 'Clothing preparation and acceptance' then
    'Clothing must be washed or cleaned as appropriate, hygienic, complete and in good wearable condition, without stains, tears, holes or significant damage. Individual listings normally need an approved resale value of at least $8 CAD. The estimated combined value for a collection request is at least $60 CAD. REWEAR inspects each item after collection and rejects items that fail these conditions; a pickup request is not acceptance.'
  when 'Minimum individual item value' then
    'Individual items normally need an approved resale value of at least $8 CAD to be listed separately. Suitable lower-value items may be combined into a bundle. Every item must pass physical inspection.'
  when 'Commission tier under $100' then
    'The seller share for an item initially approved below $100 CAD follows the current commission table in the seller account, starting at the current $8 individual minimum. The percentage locks from the initial approved price after seller approval.'
  when 'Bag or Box minimum' then
    'A REWEAR Bag or own-bag collection request requires at least $60 CAD in estimated combined resale value, an eligible service area, an available slot and acceptance of the collection terms. Pickup is free only at the separate current free-pickup threshold; final item acceptance follows physical inspection.'
  when 'Paid pickup below $100' then
    'Eligible collection requests start at $60 CAD in estimated combined resale value. A pickup from $60 to below the current $100 free-pickup threshold has the applicable flat transportation fee shown before submission. REWEAR inspects each item before acceptance.'
  when 'Requesting a Bag or Box' then
    'Start a Bag request from the signed-in Customer Account. The submitted items need an estimated combined resale value of at least $60 CAD. The request also needs an eligible service area, available time slot and acceptance of the collection terms. Each item is inspected before it can be accepted for resale.'
  when 'Bundles for lower-value items' then
    'Individual items normally need an approved resale value of at least $8 CAD. When suitable, lower-value eligible items may be combined into a bundle instead of being listed individually. The seller reviews and approves bundle pricing when required. Every item must meet condition requirements.'
  else approved_answer end,
  tags=case when title in ('Minimum individual item value','Bag or Box minimum')
    then array_remove(array_remove(tags,'minimum $20'),'$100') else tags end
where status='approved' and title in (
  'Clothing preparation and acceptance','Minimum individual item value',
  'Commission tier under $100','Bag or Box minimum','Paid pickup below $100','Requesting a Bag or Box',
  'Bundles for lower-value items');
