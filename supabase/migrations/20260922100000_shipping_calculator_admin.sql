-- Configurable shipping calculator for orders outside the Montréal local-delivery zone.

alter table public.shipping_settings
  add column if not exists calculator_enabled boolean not null default true,
  add column if not exists base_fee_cents integer not null default 900 check (base_fee_cents between 0 and 100000),
  add column if not exists per_kg_cents integer not null default 250 check (per_kg_cents between 0 and 100000),
  add column if not exists free_shipping_threshold_cents integer check (free_shipping_threshold_cents is null or free_shipping_threshold_cents between 0 and 100000000),
  add column if not exists remote_surcharge_cents integer not null default 700 check (remote_surcharge_cents between 0 and 100000),
  add column if not exists remote_provinces text[] not null default array['YT','NT','NU']::text[];

create or replace function public.admin_update_shipping_calculator(
  p_calculator_enabled boolean,
  p_base_fee_cents integer,
  p_per_kg_cents integer,
  p_free_shipping_threshold_cents integer,
  p_remote_surcharge_cents integer,
  p_remote_provinces text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare old_value jsonb; new_value jsonb;
begin
  perform private.assert_admin_permission('shipping');
  if p_base_fee_cents < 0 or p_per_kg_cents < 0 or p_remote_surcharge_cents < 0
     or (p_free_shipping_threshold_cents is not null and p_free_shipping_threshold_cents < 0) then
    raise exception 'invalid shipping calculator settings';
  end if;
  if exists (select 1 from unnest(coalesce(p_remote_provinces, array[]::text[])) p where p !~ '^[A-Z]{2}$') then
    raise exception 'invalid province code';
  end if;
  select to_jsonb(s) into old_value from public.shipping_settings s where singleton=true;
  update public.shipping_settings
  set calculator_enabled=p_calculator_enabled,
      base_fee_cents=p_base_fee_cents,
      per_kg_cents=p_per_kg_cents,
      free_shipping_threshold_cents=p_free_shipping_threshold_cents,
      remote_surcharge_cents=p_remote_surcharge_cents,
      remote_provinces=coalesce(p_remote_provinces,array[]::text[]),
      updated_by=auth.uid(), updated_at=now()
  where singleton=true
  returning to_jsonb(shipping_settings.*) into new_value;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values(auth.uid(),'shipping_calculator_changed','shipping_settings','singleton',old_value,new_value,'Admin shipping calculator');
end;
$$;

revoke all on function public.admin_update_shipping_calculator(boolean,integer,integer,integer,integer,text[]) from public, anon;
grant execute on function public.admin_update_shipping_calculator(boolean,integer,integer,integer,integer,text[]) to authenticated;

create or replace function public.get_shipping_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'canadaWideEnabled', canada_wide_enabled,
    'localCenterName', local_center_name,
    'localFreeRadiusKm', local_free_radius_km,
    'nonlocalFeeMode', nonlocal_fee_mode,
    'nonlocalFlatFeeCents', nonlocal_flat_fee_cents,
    'calculatorEnabled', calculator_enabled,
    'baseFeeCents', base_fee_cents,
    'perKgCents', per_kg_cents,
    'freeShippingThresholdCents', free_shipping_threshold_cents,
    'remoteSurchargeCents', remote_surcharge_cents,
    'remoteProvinces', remote_provinces
  )
  from public.shipping_settings
  where singleton=true;
$$;

revoke all on function public.get_shipping_policy() from public;
grant execute on function public.get_shipping_policy() to anon, authenticated;
