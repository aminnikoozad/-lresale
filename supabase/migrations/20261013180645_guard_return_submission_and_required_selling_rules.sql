-- Guard customer return submission and required selling-rule fields.
-- Native isolated API reproduction confirmed persisted unauthorized return status
-- and persisted versions with missing required numeric fields on 2026-10-13.
-- No existing return decision, price snapshot, commission lock or rule version is rewritten.
begin;

-- Customer submission cannot manufacture an administrative decision.
drop policy if exists return_requests_insert_own on public.return_requests;
create policy return_requests_insert_own
on public.return_requests
for insert to authenticated
with check (
  (select auth.uid()) = buyer_id
  and status = 'submitted'
  and exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = return_requests.order_item_id
      and oi.order_id = return_requests.order_id
      and o.id = return_requests.order_id
      and o.buyer_id = (select auth.uid())
      and o.status = 'delivered'
      and o.payment_status = 'paid'
  )
);

-- Preserve the prior permission, tier-continuity and versioning contract while
-- making every required numeric field fail closed for SQL NULL / absent JSON keys.
create or replace function public.update_selling_rules(
  new_rules jsonb,
  change_reason text,
  new_effective_at timestamptz default now()
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  previous_rules jsonb;
  next_version integer;
  minimum_value integer;
  pickup_value integer;
  tiers jsonb;
  tier_value jsonb;
  tier_rec record;
  previous_max integer := null;
  tier_index integer := 0;
begin
  if auth.uid() is null or not public.can_manage_selling_rules() then
    raise exception 'Owner or authorized Admin permission required';
  end if;
  if change_reason is null or char_length(trim(change_reason)) < 3
     or char_length(trim(change_reason)) > 500 then
    raise exception 'A valid change reason is required';
  end if;
  if new_effective_at is null then raise exception 'Effective time is required'; end if;
  if jsonb_typeof(new_rules) is distinct from 'object' then
    raise exception 'Selling rules must be a JSON object';
  end if;
  if jsonb_typeof(new_rules->'minimumIndividualItemValueCents') is distinct from 'number'
     or jsonb_typeof(new_rules->'minimumPickupEstimatedValueCents') is distinct from 'number' then
    raise exception 'Required minimum values must be numbers';
  end if;
  minimum_value := (new_rules->>'minimumIndividualItemValueCents')::integer;
  pickup_value := (new_rules->>'minimumPickupEstimatedValueCents')::integer;
  if minimum_value is null or minimum_value not between 1 and 100000000 then
    raise exception 'Invalid minimum item value';
  end if;
  if pickup_value is null or pickup_value not between 1 and 100000000 then
    raise exception 'Invalid minimum pickup value';
  end if;
  tiers := new_rules->'commissionTiers';
  if jsonb_typeof(tiers) is distinct from 'array' then
    raise exception 'At least one commission tier is required';
  end if;
  if jsonb_array_length(tiers) < 1 then raise exception 'At least one commission tier is required'; end if;

  for tier_value in select value from jsonb_array_elements(tiers) loop
    if jsonb_typeof(tier_value) is distinct from 'object'
       or jsonb_typeof(tier_value->'minCents') is distinct from 'number'
       or jsonb_typeof(tier_value->'sellerBps') is distinct from 'number'
       or jsonb_typeof(tier_value->'platformBps') is distinct from 'number'
       or (tier_value ? 'maxCents' and jsonb_typeof(tier_value->'maxCents') not in ('number','null')) then
      raise exception 'Required commission tier values must be numbers';
    end if;
  end loop;

  for tier_rec in
    select (tier->>'minCents')::integer min_cents,
      case when tier->'maxCents' is null or tier->'maxCents'='null'::jsonb
           then null else (tier->>'maxCents')::integer end max_cents,
      (tier->>'sellerBps')::integer seller_bps,
      (tier->>'platformBps')::integer platform_bps
    from jsonb_array_elements(tiers) tier
    order by (tier->>'minCents')::integer
  loop
    tier_index := tier_index + 1;
    if tier_rec.min_cents is null or tier_rec.seller_bps is null or tier_rec.platform_bps is null
       or tier_rec.min_cents < 0
       or tier_rec.seller_bps not between 0 and 10000
       or tier_rec.platform_bps not between 0 and 10000
       or tier_rec.seller_bps + tier_rec.platform_bps <> 10000 then
      raise exception 'Invalid commission tier';
    end if;
    if tier_rec.max_cents is not null and tier_rec.max_cents < tier_rec.min_cents then
      raise exception 'Invalid commission tier range';
    end if;
    if tier_index=1 and tier_rec.min_cents <> minimum_value then
      raise exception 'First commission tier must start at minimum item value';
    end if;
    if tier_index>1 and (previous_max is null or tier_rec.min_cents <> previous_max+1) then
      raise exception 'Commission tiers must be continuous with no gaps or overlaps';
    end if;
    previous_max := tier_rec.max_cents;
  end loop;
  if previous_max is not null then raise exception 'Final commission tier must be open ended'; end if;

  select value into previous_rules
  from public.business_setting_versions
  where setting_key='selling_rules' and effective_at<=now()
  order by effective_at desc,version desc limit 1;
  select coalesce(max(version),0)+1 into next_version
  from public.business_setting_versions where setting_key='selling_rules';
  insert into public.business_setting_versions(setting_key,version,value,effective_at,created_by,reason)
  values('selling_rules',next_version,new_rules,new_effective_at,auth.uid(),trim(change_reason));
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values(auth.uid(),'selling_rules.updated','business_settings','selling_rules',previous_rules,new_rules,trim(change_reason));
  return next_version;
end;
$$;

commit;
