begin;

-- Low-value pickup pricing is a single flat pickup fee, not a per-item fee.
-- The configured 500-cent amount is retained; only the calculation semantics change.

alter table public.collection_requests
  drop constraint if exists collection_pickup_pricing_mode;

alter table public.collection_requests
  add constraint collection_pickup_pricing_mode
  check (pickup_pricing_mode in ('free_priority', 'paid_flat'));

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
  flat_pickup_fee integer;
  bag_minimum integer;
  priority_enabled boolean;
begin
  rules := public.get_selling_rules();
  pickup_rules := coalesce(rules -> 'pickupRules', '{}'::jsonb);

  free_threshold := greatest(
    1,
    coalesce((pickup_rules ->> 'freePickupThresholdCents')::integer, 10000)
  );
  flat_pickup_fee := greatest(
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
    new.pickup_fee_cents := flat_pickup_fee;
    new.pickup_pricing_mode := 'paid_flat';
    new.priority_pickup := false;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_collection_pickup_pricing() from public, anon, authenticated;

-- Correct any already-created low-value requests if this migration is applied
-- to an environment that has them. Production had none at authoring time.
update public.collection_requests
set pickup_fee_cents = greatest(
      0,
      coalesce(
        (public.get_selling_rules() -> 'pickupRules' ->> 'lowValuePickupItemFeeCents')::integer,
        500
      )
    ),
    pickup_pricing_mode = 'paid_flat',
    priority_pickup = false,
    updated_at = now()
where pickup_pricing_mode = 'paid_per_item';

commit;
