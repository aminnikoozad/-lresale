-- Lock operational tables behind security-definer RPCs and expose only a minimal public shipping policy.

alter table public.pickup_reminder_settings enable row level security;
alter table public.pickup_reminder_jobs enable row level security;
alter table public.shipping_settings enable row level security;

revoke all on public.pickup_reminder_settings from anon, authenticated;
revoke all on public.pickup_reminder_jobs from anon, authenticated;
revoke all on public.shipping_settings from anon, authenticated;

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
    'nonlocalFlatFeeCents', nonlocal_flat_fee_cents
  )
  from public.shipping_settings
  where singleton = true;
$$;

revoke all on function public.get_shipping_policy() from public;
grant execute on function public.get_shipping_policy() to anon, authenticated;
