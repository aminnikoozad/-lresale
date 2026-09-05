alter table public.items
  add column if not exists locked_commission_rule_version integer,
  add column if not exists locked_commission_tier jsonb;

alter table public.bundles
  add column if not exists locked_commission_rule_version integer,
  add column if not exists locked_commission_tier jsonb;

create or replace function private.current_commission_resolution(initial_price integer)
returns table (
  rule_version integer,
  tier jsonb,
  seller_bps integer,
  platform_bps integer
)
language sql
security definer
set search_path = ''
stable
as $$
  with current_rules as (
    select version, value
    from public.business_setting_versions
    where setting_key = 'selling_rules' and effective_at <= now()
    order by effective_at desc, version desc
    limit 1
  ), tiers as (
    select current_rules.version, tier
    from current_rules,
    lateral jsonb_array_elements(current_rules.value -> 'commissionTiers') tier
  )
  select
    version,
    tier,
    (tier ->> 'sellerBps')::integer,
    (tier ->> 'platformBps')::integer
  from tiers
  where initial_price >= (tier ->> 'minCents')::integer
    and ((tier -> 'maxCents') = 'null'::jsonb or initial_price <= (tier ->> 'maxCents')::integer)
  order by (tier ->> 'minCents')::integer desc
  limit 1;
$$;

revoke all on function private.current_commission_resolution(integer) from public, anon, authenticated;

create or replace function private.guard_item_commission() returns trigger
language plpgsql set search_path = '' as $$
declare
  configured_minimum integer;
  resolved_rule_version integer;
  resolved_tier jsonb;
  resolved_seller_bps integer;
  resolved_platform_bps integer;
  has_override boolean;
  tier_price integer;
begin
  if TG_OP = 'UPDATE' and old.seller_pricing_approved_at is not null then
    if (
      new.initial_approved_price_cents,
      new.locked_seller_commission_bps,
      new.locked_platform_commission_bps,
      new.locked_commission_rule_version,
      new.locked_commission_tier,
      new.seller_pricing_approved_at,
      new.owner_id
    ) is distinct from (
      old.initial_approved_price_cents,
      old.locked_seller_commission_bps,
      old.locked_platform_commission_bps,
      old.locked_commission_rule_version,
      old.locked_commission_tier,
      old.seller_pricing_approved_at,
      old.owner_id
    ) then
      raise exception 'Approved pricing and commission are permanently locked';
    end if;
  elsif new.seller_pricing_approved_at is not null then
    if auth.uid() is null or auth.uid() <> new.owner_id or new.status not in ('accepted','waiting_for_seller_approval')
       or new.initial_approved_price_cents is null then
      raise exception 'Only the seller may approve eligible item pricing';
    end if;

    configured_minimum := (public.get_selling_rules() ->> 'minimumIndividualItemValueCents')::integer;
    select exists(
      select 1 from public.item_rule_overrides o
      where o.item_id = new.id and o.override_type = 'below_minimum_value'
    ) into has_override;

    if new.initial_approved_price_cents < configured_minimum and not has_override then
      raise exception 'Item is below the current minimum individual listing value';
    end if;

    tier_price := case
      when has_override then greatest(new.initial_approved_price_cents, configured_minimum)
      else new.initial_approved_price_cents
    end;

    select rule_version, tier, seller_bps, platform_bps
      into resolved_rule_version, resolved_tier, resolved_seller_bps, resolved_platform_bps
      from private.current_commission_resolution(tier_price);

    if resolved_seller_bps is null then raise exception 'No commission tier applies to this item'; end if;

    new.seller_pricing_approved_at := now();
    new.locked_seller_commission_bps := resolved_seller_bps;
    new.locked_platform_commission_bps := resolved_platform_bps;
    new.locked_commission_rule_version := resolved_rule_version;
    new.locked_commission_tier := resolved_tier;
    new.listed_price_cents := new.initial_approved_price_cents;
  else
    new.locked_seller_commission_bps := null;
    new.locked_platform_commission_bps := null;
    new.locked_commission_rule_version := null;
    new.locked_commission_tier := null;
  end if;

  if (new.status in ('listed','sold','auctioned') or new.sold_price_cents is not null)
     and new.seller_pricing_approved_at is null then
    raise exception 'Seller pricing approval is required before publishing or sale';
  end if;
  return new;
end;
$$;

create or replace function private.guard_bundle_commission() returns trigger
language plpgsql set search_path = '' as $$
declare
  configured_minimum integer;
  resolved_rule_version integer;
  resolved_tier jsonb;
  resolved_seller_bps integer;
  resolved_platform_bps integer;
begin
  if TG_OP = 'UPDATE' and old.seller_pricing_approved_at is not null then
    if (
      new.initial_approved_price_cents,
      new.locked_seller_commission_bps,
      new.locked_platform_commission_bps,
      new.locked_commission_rule_version,
      new.locked_commission_tier,
      new.seller_pricing_approved_at,
      new.owner_id
    ) is distinct from (
      old.initial_approved_price_cents,
      old.locked_seller_commission_bps,
      old.locked_platform_commission_bps,
      old.locked_commission_rule_version,
      old.locked_commission_tier,
      old.seller_pricing_approved_at,
      old.owner_id
    ) then
      raise exception 'Approved bundle pricing and commission are permanently locked';
    end if;
  elsif new.seller_pricing_approved_at is not null then
    if auth.uid() is null or auth.uid() <> new.owner_id or new.initial_approved_price_cents is null then
      raise exception 'Only the seller may approve bundle pricing';
    end if;

    configured_minimum := (public.get_selling_rules() ->> 'minimumIndividualItemValueCents')::integer;
    if new.initial_approved_price_cents < configured_minimum then
      raise exception 'Bundle is below the current minimum listing value';
    end if;

    select rule_version, tier, seller_bps, platform_bps
      into resolved_rule_version, resolved_tier, resolved_seller_bps, resolved_platform_bps
      from private.current_commission_resolution(new.initial_approved_price_cents);

    if resolved_seller_bps is null then raise exception 'No commission tier applies to this bundle'; end if;

    new.seller_pricing_approved_at := now();
    new.locked_seller_commission_bps := resolved_seller_bps;
    new.locked_platform_commission_bps := resolved_platform_bps;
    new.locked_commission_rule_version := resolved_rule_version;
    new.locked_commission_tier := resolved_tier;
    new.listed_price_cents := new.initial_approved_price_cents;
  else
    if new.seller_pricing_approved_at is null then
      new.locked_seller_commission_bps := null;
      new.locked_platform_commission_bps := null;
      new.locked_commission_rule_version := null;
      new.locked_commission_tier := null;
    end if;
  end if;
  return new;
end;
$$;
