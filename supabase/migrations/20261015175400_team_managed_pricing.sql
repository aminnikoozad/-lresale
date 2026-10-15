-- Explicit account-level mandate; existing locked prices are never rewritten.
-- seller_pricing_approved_at remains the legacy commission-lock timestamp.
-- pricing_authority records whether that lock came from the seller or the team.
create table private.team_pricing_mandates (
  owner_id uuid primary key references auth.users(id),
  terms_version text not null check (terms_version = '2026-10-15-team-v1'),
  accepted_at timestamptz not null default now()
);
alter table private.team_pricing_mandates enable row level security;
revoke all on private.team_pricing_mandates from public,anon,authenticated;
alter table public.items add column pricing_authority text not null default 'seller' check (pricing_authority in ('seller','team'));
alter table public.bundles add column pricing_authority text not null default 'seller' check (pricing_authority in ('seller','team'));
revoke update (pricing_authority) on public.items,public.bundles from authenticated;

create function private.has_team_pricing_mandate(target_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.team_pricing_mandates where owner_id=target_owner and terms_version='2026-10-15-team-v1');
$$;
revoke all on function private.has_team_pricing_mandate(uuid) from public,anon,authenticated;

create function public.my_team_pricing_mandate() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
 return jsonb_build_object('version','2026-10-15-team-v1','accepted',private.has_team_pricing_mandate(auth.uid()));
end;$$;

create function public.accept_team_pricing_mandate(expected_version text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
 if expected_version is distinct from '2026-10-15-team-v1' then raise exception 'Terms changed; refresh and review'; end if;
 insert into private.team_pricing_mandates(owner_id,terms_version) values(auth.uid(),expected_version) on conflict(owner_id) do nothing;
end;$$;

create function public.admin_team_pricing_mandates() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_manage_items() or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Item staff with MFA required'; end if;
 return coalesce((select jsonb_agg(owner_id) from private.team_pricing_mandates),'[]'::jsonb);
end;$$;
revoke all on function public.my_team_pricing_mandate(),public.accept_team_pricing_mandate(text),public.admin_team_pricing_mandates() from public,anon;
grant execute on function public.my_team_pricing_mandate(),public.accept_team_pricing_mandate(text),public.admin_team_pricing_mandates() to authenticated;

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
  if new.pricing_authority = 'team' and new.seller_pricing_approved_at is null then
    raise exception 'Team pricing must be finalized with its commission';
  end if;
  if TG_OP = 'UPDATE' and old.seller_pricing_approved_at is not null then
    if (
      new.initial_approved_price_cents,
      new.locked_seller_commission_bps,
      new.locked_platform_commission_bps,
      new.locked_commission_rule_version,
      new.locked_commission_tier,
      new.seller_pricing_approved_at,
      new.owner_id, new.pricing_authority
    ) is distinct from (
      old.initial_approved_price_cents,
      old.locked_seller_commission_bps,
      old.locked_platform_commission_bps,
      old.locked_commission_rule_version,
      old.locked_commission_tier,
      old.seller_pricing_approved_at,
      old.owner_id, old.pricing_authority
    ) then
      raise exception 'Approved pricing and commission are permanently locked';
    end if;
  elsif new.seller_pricing_approved_at is not null then
    if new.pricing_authority = 'seller' and private.has_team_pricing_mandate(new.owner_id) then
      raise exception 'Team pricing must be finalized by authorized staff';
    end if;
    if auth.uid() is null or (new.pricing_authority = 'seller' and auth.uid() <> new.owner_id)
       or (new.pricing_authority = 'team' and (not public.can_manage_items() or auth.jwt()->>'aal' is distinct from 'aal2' or not private.has_team_pricing_mandate(new.owner_id))) or new.status not in ('accepted','waiting_for_seller_approval')
       or new.initial_approved_price_cents is null then
      raise exception 'Pricing requires the seller or authorized team mandate';
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
  if new.pricing_authority = 'team' and new.seller_pricing_approved_at is null then
    raise exception 'Team pricing must be finalized with its commission';
  end if;
  if TG_OP = 'UPDATE' and old.seller_pricing_approved_at is not null then
    if (
      new.initial_approved_price_cents,
      new.locked_seller_commission_bps,
      new.locked_platform_commission_bps,
      new.locked_commission_rule_version,
      new.locked_commission_tier,
      new.seller_pricing_approved_at,
      new.owner_id, new.pricing_authority
    ) is distinct from (
      old.initial_approved_price_cents,
      old.locked_seller_commission_bps,
      old.locked_platform_commission_bps,
      old.locked_commission_rule_version,
      old.locked_commission_tier,
      old.seller_pricing_approved_at,
      old.owner_id, old.pricing_authority
    ) then
      raise exception 'Approved bundle pricing and commission are permanently locked';
    end if;
  elsif new.seller_pricing_approved_at is not null then
    if new.pricing_authority = 'seller' and private.has_team_pricing_mandate(new.owner_id) then
      raise exception 'Team pricing must be finalized by authorized staff';
    end if;
    if auth.uid() is null or (new.pricing_authority = 'seller' and auth.uid() <> new.owner_id)
       or (new.pricing_authority = 'team' and (not public.can_manage_items() or auth.jwt()->>'aal' is distinct from 'aal2' or not private.has_team_pricing_mandate(new.owner_id))) or new.initial_approved_price_cents is null then
      raise exception 'Pricing requires the seller or authorized team mandate';
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

create function public.admin_finalize_team_item_pricing(target_item_id uuid,expected_price integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.items%rowtype;
begin
 if auth.uid() is null or not public.can_manage_items() or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Item staff with MFA required'; end if;
 select * into r from public.items where id=target_item_id for update;
 if not found or r.status not in ('accepted','waiting_for_seller_approval') then raise exception 'Item unavailable for final pricing'; end if;
 if not private.has_team_pricing_mandate(r.owner_id) then raise exception 'Seller must accept team pricing terms first'; end if;
 if expected_price is null or expected_price is distinct from r.initial_approved_price_cents then raise exception 'Price changed; refresh'; end if;
 if r.inspected_at is null then raise exception 'Recorded physical inspection required'; end if;
 if r.seller_pricing_approved_at is not null then raise exception 'Pricing is already locked'; end if;
 update public.items set pricing_authority='team',seller_pricing_approved_at=now() where id=r.id;
 -- Team publication stays explicit: the inherited seller-review timer must not publish it.
 update public.item_operations set auto_publish_enabled=false,auto_publish_at=null,stage='ready_to_publish' where item_id=r.id;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(auth.uid(),'item.team_pricing_finalized','item',r.id::text,jsonb_build_object('priceCents',expected_price,'termsVersion','2026-10-15-team-v1'),'Team pricing mandate; no separate item approval required');
 insert into public.customer_account_updates(customer_id,author_id,body,customer_visible)
 values(r.owner_id,auth.uid(),'Shikimomo finalized the price for ' || r.name || ': CAD ' || (expected_price/100.0)::numeric(12,2)::text || '. See your account for the price and locked commission.',true);
end;$$;

create function public.admin_finalize_team_bundle_pricing(target_bundle_id uuid,expected_price integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.bundles%rowtype;
begin
 if auth.uid() is null or not public.can_manage_items() or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Item staff with MFA required'; end if;
 select * into r from public.bundles where id=target_bundle_id for update;
 if not found or r.status <> 'waiting_for_seller_approval' then raise exception 'Bundle unavailable for final pricing'; end if;
 if not private.has_team_pricing_mandate(r.owner_id) then raise exception 'Seller must accept team pricing terms first'; end if;
 if expected_price is null or expected_price is distinct from r.initial_approved_price_cents then raise exception 'Price changed; refresh'; end if;
 if (select count(*) from public.bundle_items where bundle_id=r.id)<2 or exists(select 1 from public.bundle_items b join public.items i on i.id=b.item_id where b.bundle_id=r.id and (i.owner_id<>r.owner_id or i.inspected_at is null)) then raise exception 'Every bundle item requires owner match and physical inspection'; end if;
 if r.seller_pricing_approved_at is not null then raise exception 'Pricing is already locked'; end if;
 update public.bundles set pricing_authority='team',seller_pricing_approved_at=now(),status='approved' where id=r.id;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(auth.uid(),'bundle.team_pricing_finalized','bundle',r.id::text,jsonb_build_object('priceCents',expected_price,'termsVersion','2026-10-15-team-v1'),'Team pricing mandate');
end;$$;
revoke all on function public.admin_finalize_team_item_pricing(uuid,integer),public.admin_finalize_team_bundle_pricing(uuid,integer) from public,anon;
grant execute on function public.admin_finalize_team_item_pricing(uuid,integer),public.admin_finalize_team_bundle_pricing(uuid,integer) to authenticated;

alter table public.collection_requests add column team_pricing_terms_version text;
create function private.require_team_pricing_for_collection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not private.has_team_pricing_mandate(new.user_id) then raise exception 'Accept team pricing terms before requesting collection'; end if;
 new.team_pricing_terms_version := '2026-10-15-team-v1';
 return new;
end;$$;
revoke all on function private.require_team_pricing_for_collection() from public,anon,authenticated;
create trigger collection_requests_team_pricing before insert on public.collection_requests
for each row execute function private.require_team_pricing_for_collection();

create function public.admin_pending_team_bundles() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_manage_items() or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Item staff with MFA required'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from (
   select b.id,b.title,b.initial_approved_price_cents as price
   from public.bundles b where b.status='waiting_for_seller_approval' and b.seller_pricing_approved_at is null and private.has_team_pricing_mandate(b.owner_id)
   order by b.created_at limit 200
 )r),'[]'::jsonb);
end;$$;
revoke all on function public.admin_pending_team_bundles() from public,anon;
grant execute on function public.admin_pending_team_bundles() to authenticated;
