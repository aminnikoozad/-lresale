-- Configurable selling rules, commission versioning, bundle tracking and admin audit support.

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  can_manage_selling_rules boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_roles_role_check check (role in ('owner','admin','operations_manager','finance','support','warehouse','logistics','read_only'))
);

create table if not exists public.business_setting_versions (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null,
  version integer not null,
  value jsonb not null,
  effective_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  constraint business_setting_key_length check (char_length(setting_key) between 2 and 100),
  constraint business_setting_version_positive check (version > 0),
  constraint business_setting_reason_length check (reason is null or char_length(reason) between 3 and 500),
  unique (setting_key, version)
);

create index if not exists business_setting_versions_current_idx
  on public.business_setting_versions (setting_key, effective_at desc, version desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now(),
  constraint audit_action_length check (char_length(action) between 2 and 120),
  constraint audit_entity_type_length check (char_length(entity_type) between 2 and 120),
  constraint audit_reason_length check (reason is null or char_length(reason) between 3 and 500)
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_admin_idx on public.audit_logs (admin_user_id, created_at desc);

create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'draft',
  initial_approved_price_cents integer,
  listed_price_cents integer,
  sold_price_cents integer,
  locked_seller_commission_bps integer,
  locked_platform_commission_bps integer,
  seller_pricing_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bundles_title_length check (char_length(title) between 2 and 160),
  constraint bundles_status_check check (status in ('draft','pricing_pending','waiting_for_seller_approval','approved','listed','reserved','sold','returned','archived')),
  constraint bundles_initial_price_check check (initial_approved_price_cents is null or initial_approved_price_cents between 1 and 100000000),
  constraint bundles_listed_price_check check (listed_price_cents is null or listed_price_cents between 0 and 100000000),
  constraint bundles_sold_price_check check (sold_price_cents is null or sold_price_cents between 0 and 100000000),
  constraint bundles_commission_sum check (
    (locked_seller_commission_bps is null and locked_platform_commission_bps is null)
    or (locked_seller_commission_bps between 0 and 10000 and locked_platform_commission_bps between 0 and 10000 and locked_seller_commission_bps + locked_platform_commission_bps = 10000)
  )
);

create table if not exists public.bundle_items (
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  added_at timestamptz not null default now(),
  primary key (bundle_id, item_id),
  unique (item_id)
);

create table if not exists public.item_rule_overrides (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  override_type text not null,
  reason text not null,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint item_override_type_check check (override_type in ('below_minimum_value','pricing','acceptance','selling_period','pickup_fee')),
  constraint item_override_reason_length check (char_length(reason) between 3 and 500)
);

-- Expand operational item statuses required by the managed-resale workflow.
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check check (status in (
  'submitted','pickup_requested','collected','received','inspection_pending','inspection','manual_review',
  'accepted','rejected','bundle_candidate','bundled','pricing_pending','waiting_for_seller_approval',
  'approved','photography_pending','listing_preparation','listed','reserved','sold','return_requested',
  'return_pending','returned','relisted','selling_period_expired','return_to_seller','donation_pending',
  'donated','auctioned','archived'
));

-- Do not hard-code the business minimum in a table constraint. Current configured rules are enforced at approval time.
alter table public.items drop constraint if exists items_initial_approved_price_cents_check;
alter table public.items add constraint items_initial_approved_price_cents_check
  check (initial_approved_price_cents is null or initial_approved_price_cents between 1 and 100000000);

insert into public.business_setting_versions (setting_key, version, value, effective_at, reason)
select
  'selling_rules',
  1,
  jsonb_build_object(
    'minimumIndividualItemValueCents', 2000,
    'minimumPickupEstimatedValueCents', 10000,
    'commissionTiers', jsonb_build_array(
      jsonb_build_object('minCents',2000,'maxCents',9999,'sellerBps',4500,'platformBps',5500),
      jsonb_build_object('minCents',10000,'maxCents',24999,'sellerBps',5000,'platformBps',5000),
      jsonb_build_object('minCents',25000,'maxCents',49999,'sellerBps',5500,'platformBps',4500),
      jsonb_build_object('minCents',50000,'maxCents',null,'sellerBps',6500,'platformBps',3500)
    ),
    'bundleEligibility', true,
    'sellingPeriodDays', 90,
    'discountSchedule', '[]'::jsonb,
    'minimumSellingPriceCents', 2000,
    'pickupRules', jsonb_build_object(
      'confirmationRequired', true,
      'firstMissedPickupFeeCents', 0,
      'secondMissedPickupFeeCents', 1000,
      'suspendFreePickupAfterMisses', 3
    ),
    'storeCreditBonusBps', 0,
    'returnPeriodDays', null,
    'highValueThresholdCents', 50000
  ),
  now(),
  'Initial Rewear selling rules'
where not exists (
  select 1 from public.business_setting_versions where setting_key = 'selling_rules'
);

create or replace function public.get_selling_rules()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select value
  from public.business_setting_versions
  where setting_key = 'selling_rules' and effective_at <= now()
  order by effective_at desc, version desc
  limit 1;
$$;

revoke all on function public.get_selling_rules() from public;
grant execute on function public.get_selling_rules() to anon, authenticated;

create or replace function public.can_manage_selling_rules()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = auth.uid()
      and (role = 'owner' or can_manage_selling_rules)
  );
$$;

revoke all on function public.can_manage_selling_rules() from public, anon;
grant execute on function public.can_manage_selling_rules() to authenticated;

create or replace function public.update_selling_rules(new_rules jsonb, change_reason text, new_effective_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_rules jsonb;
  next_version integer;
  minimum_value integer;
  pickup_value integer;
  tiers jsonb;
begin
  if auth.uid() is null or not public.can_manage_selling_rules() then
    raise exception 'Owner or authorized Admin permission required';
  end if;
  if change_reason is null or char_length(trim(change_reason)) < 3 then
    raise exception 'A change reason is required';
  end if;
  if jsonb_typeof(new_rules) <> 'object' then
    raise exception 'Selling rules must be a JSON object';
  end if;

  minimum_value := (new_rules ->> 'minimumIndividualItemValueCents')::integer;
  pickup_value := (new_rules ->> 'minimumPickupEstimatedValueCents')::integer;
  tiers := new_rules -> 'commissionTiers';

  if minimum_value < 1 or minimum_value > 100000000 then raise exception 'Invalid minimum item value'; end if;
  if pickup_value < 1 or pickup_value > 100000000 then raise exception 'Invalid minimum pickup value'; end if;
  if jsonb_typeof(tiers) <> 'array' or jsonb_array_length(tiers) < 1 then raise exception 'At least one commission tier is required'; end if;
  if exists (
    select 1 from jsonb_array_elements(tiers) tier
    where (tier ->> 'sellerBps')::integer < 0
       or (tier ->> 'platformBps')::integer < 0
       or (tier ->> 'sellerBps')::integer + (tier ->> 'platformBps')::integer <> 10000
       or (tier ->> 'minCents')::integer < 0
  ) then raise exception 'Invalid commission tier'; end if;

  select value into previous_rules
  from public.business_setting_versions
  where setting_key = 'selling_rules' and effective_at <= now()
  order by effective_at desc, version desc limit 1;

  select coalesce(max(version),0) + 1 into next_version
  from public.business_setting_versions where setting_key = 'selling_rules';

  insert into public.business_setting_versions(setting_key,version,value,effective_at,created_by,reason)
  values ('selling_rules',next_version,new_rules,new_effective_at,auth.uid(),trim(change_reason));

  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values (auth.uid(),'selling_rules.updated','business_settings','selling_rules',previous_rules,new_rules,trim(change_reason));

  return next_version;
end;
$$;

revoke all on function public.update_selling_rules(jsonb,text,timestamptz) from public, anon;
grant execute on function public.update_selling_rules(jsonb,text,timestamptz) to authenticated;

-- Resolve the commission tier from the currently effective rule version.
create or replace function private.current_commission_tier(initial_price integer)
returns table (seller_bps integer, platform_bps integer)
language sql
security definer
set search_path = ''
stable
as $$
  with rules as (select public.get_selling_rules() as value),
  tiers as (
    select tier
    from rules, lateral jsonb_array_elements(value -> 'commissionTiers') tier
  )
  select (tier ->> 'sellerBps')::integer, (tier ->> 'platformBps')::integer
  from tiers
  where initial_price >= (tier ->> 'minCents')::integer
    and ((tier -> 'maxCents') = 'null'::jsonb or initial_price <= (tier ->> 'maxCents')::integer)
  order by (tier ->> 'minCents')::integer desc
  limit 1;
$$;

revoke all on function private.current_commission_tier(integer) from public, anon, authenticated;

-- Commission is locked exactly once using the rule version in effect at seller approval.
create or replace function private.guard_item_commission() returns trigger
language plpgsql set search_path = '' as $$
declare
  configured_minimum integer;
  resolved_seller_bps integer;
  resolved_platform_bps integer;
  has_override boolean;
begin
  if TG_OP = 'UPDATE' and old.seller_pricing_approved_at is not null then
    if (new.initial_approved_price_cents, new.locked_seller_commission_bps,
        new.locked_platform_commission_bps, new.seller_pricing_approved_at, new.owner_id)
      is distinct from
       (old.initial_approved_price_cents, old.locked_seller_commission_bps,
        old.locked_platform_commission_bps, old.seller_pricing_approved_at, old.owner_id) then
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

    select seller_bps, platform_bps
      into resolved_seller_bps, resolved_platform_bps
      from private.current_commission_tier(new.initial_approved_price_cents);
    if resolved_seller_bps is null then raise exception 'No commission tier applies to this item'; end if;

    new.seller_pricing_approved_at := now();
    new.locked_seller_commission_bps := resolved_seller_bps;
    new.locked_platform_commission_bps := resolved_platform_bps;
    new.listed_price_cents := new.initial_approved_price_cents;
  else
    new.locked_seller_commission_bps := null;
    new.locked_platform_commission_bps := null;
  end if;

  if (new.status in ('listed','sold','auctioned') or new.sold_price_cents is not null)
     and new.seller_pricing_approved_at is null then
    raise exception 'Seller pricing approval is required before publishing or sale';
  end if;
  return new;
end;
$$;

-- Bundle commissions follow the same lock-on-approval rule.
create or replace function private.guard_bundle_commission() returns trigger
language plpgsql set search_path = '' as $$
declare
  configured_minimum integer;
  resolved_seller_bps integer;
  resolved_platform_bps integer;
begin
  if TG_OP = 'UPDATE' and old.seller_pricing_approved_at is not null then
    if (new.initial_approved_price_cents,new.locked_seller_commission_bps,new.locked_platform_commission_bps,new.seller_pricing_approved_at,new.owner_id)
       is distinct from
       (old.initial_approved_price_cents,old.locked_seller_commission_bps,old.locked_platform_commission_bps,old.seller_pricing_approved_at,old.owner_id) then
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
    select seller_bps,platform_bps into resolved_seller_bps,resolved_platform_bps
      from private.current_commission_tier(new.initial_approved_price_cents);
    if resolved_seller_bps is null then raise exception 'No commission tier applies to this bundle'; end if;
    new.seller_pricing_approved_at := now();
    new.locked_seller_commission_bps := resolved_seller_bps;
    new.locked_platform_commission_bps := resolved_platform_bps;
    new.listed_price_cents := new.initial_approved_price_cents;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_bundle_commission() from public, anon, authenticated;
drop trigger if exists bundles_guard_commission on public.bundles;
create trigger bundles_guard_commission before insert or update on public.bundles
for each row execute function private.guard_bundle_commission();

-- RLS and explicit grants.
alter table public.admin_roles enable row level security;
alter table public.business_setting_versions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;
alter table public.item_rule_overrides enable row level security;

alter table public.admin_roles force row level security;
alter table public.business_setting_versions force row level security;
alter table public.audit_logs force row level security;
alter table public.bundles force row level security;
alter table public.bundle_items force row level security;
alter table public.item_rule_overrides force row level security;

create policy bundles_select_own on public.bundles for select to authenticated using ((select auth.uid()) = owner_id);
create policy bundle_items_select_own on public.bundle_items for select to authenticated using (
  exists (select 1 from public.bundles b where b.id = bundle_id and b.owner_id = (select auth.uid()))
);
create policy business_settings_admin_select on public.business_setting_versions for select to authenticated using (public.can_manage_selling_rules());
create policy audit_admin_select on public.audit_logs for select to authenticated using (public.can_manage_selling_rules());
create policy admin_roles_self_select on public.admin_roles for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.admin_roles from anon, authenticated;
revoke all on table public.business_setting_versions from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.bundles from anon, authenticated;
revoke all on table public.bundle_items from anon, authenticated;
revoke all on table public.item_rule_overrides from anon, authenticated;

grant select on public.admin_roles to authenticated;
grant select on public.business_setting_versions to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.bundles to authenticated;
grant select on public.bundle_items to authenticated;
