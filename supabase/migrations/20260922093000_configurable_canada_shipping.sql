-- Configurable Canada-wide shipping engine for REWEAR.
-- Additive migration: existing taxonomy, checkout reservations and Home & Decor data remain authoritative.

-- Extend the existing shipping_settings singleton instead of duplicating the established 20 km/local-delivery configuration.
alter table public.shipping_settings add column if not exists free_local_enabled boolean not null default true;
alter table public.shipping_settings add column if not exists dimensional_divisor integer not null default 5000 check (dimensional_divisor between 1 and 100000);
alter table public.shipping_settings add column if not exists handling_cents integer not null default 0 check (handling_cents >= 0);
alter table public.shipping_settings add column if not exists minimum_cents integer not null default 0 check (minimum_cents >= 0);
alter table public.shipping_settings add column if not exists maximum_cents integer check (maximum_cents is null or maximum_cents >= 0);
alter table public.shipping_settings add column if not exists heavy_threshold_grams integer not null default 15000 check (heavy_threshold_grams > 0);
alter table public.shipping_settings add column if not exists heavy_surcharge_cents integer not null default 0 check (heavy_surcharge_cents >= 0);
alter table public.shipping_settings add column if not exists oversize_surcharge_cents integer not null default 0 check (oversize_surcharge_cents >= 0);
alter table public.shipping_settings add column if not exists fragile_surcharge_cents integer not null default 0 check (fragile_surcharge_cents >= 0);
alter table public.shipping_settings add column if not exists quote_ttl_seconds integer not null default 1800 check (quote_ttl_seconds between 60 and 86400);
alter table public.shipping_settings add column if not exists rule_version integer not null default 1 check (rule_version > 0);

create table if not exists public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_cents integer not null default 0 check (base_cents >= 0),
  additional_kg_cents integer not null default 0 check (additional_kg_cents >= 0),
  enabled boolean not null default true,
  priority integer not null default 100,
  rule_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipping_zone_postal_rules (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid references public.shipping_zones(id) on delete cascade,
  fsa_prefix text not null check (fsa_prefix ~ '^[ABCEGHJKLMNPRSTVXY][0-9][ABCEGHJKLMNPRSTVWXYZ]$'),
  is_local_free boolean not null default false,
  shipping_disabled boolean not null default false,
  active boolean not null default true,
  priority integer not null default 100,
  rule_version integer not null default 1,
  unique(fsa_prefix, priority)
);
create index if not exists shipping_postal_active_fsa_idx on public.shipping_zone_postal_rules(fsa_prefix, active, priority);
create index if not exists shipping_zones_active_priority_idx on public.shipping_zones(enabled, priority);

create table if not exists public.shipping_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  weight_grams integer not null check (weight_grams > 0),
  length_mm integer not null check (length_mm > 0),
  width_mm integer not null check (width_mm > 0),
  height_mm integer not null check (height_mm > 0),
  fragile boolean not null default false,
  oversize boolean not null default false,
  ships_separately boolean not null default false,
  local_delivery_only boolean not null default false,
  compatibility_group text not null default 'general',
  active boolean not null default true,
  rule_version integer not null default 1
);

create table if not exists public.shipping_category_rules (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  subcategory text,
  profile_id uuid references public.shipping_profiles(id) on delete restrict,
  surcharge_cents integer not null default 0 check (surcharge_cents >= 0),
  active boolean not null default true,
  priority integer not null default 100,
  rule_version integer not null default 1,
  unique(category, subcategory)
);
create index if not exists shipping_category_lookup_idx on public.shipping_category_rules(category, subcategory, active, priority);

alter table public.items add column if not exists shipping_weight_grams integer check (shipping_weight_grams is null or shipping_weight_grams > 0);
alter table public.items add column if not exists shipping_length_mm integer check (shipping_length_mm is null or shipping_length_mm > 0);
alter table public.items add column if not exists shipping_width_mm integer check (shipping_width_mm is null or shipping_width_mm > 0);
alter table public.items add column if not exists shipping_height_mm integer check (shipping_height_mm is null or shipping_height_mm > 0);
alter table public.items add column if not exists shipping_fragile boolean;
alter table public.items add column if not exists shipping_oversize boolean;
alter table public.items add column if not exists shipping_separately boolean;
alter table public.items add column if not exists local_delivery_only boolean;
alter table public.items add column if not exists shipping_profile_override_id uuid references public.shipping_profiles(id) on delete set null;

create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid,
  item_ids uuid[] not null,
  postal_fsa text not null,
  shipping_cents integer,
  status text not null check (status in ('ok','local_free','local_only','unavailable','configuration_error')),
  package_count integer,
  zone_id uuid references public.shipping_zones(id),
  rule_version integer not null,
  calculation_version text not null default 'internal-v1',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists shipping_quotes_expiry_idx on public.shipping_quotes(expires_at);

create table if not exists public.order_shipping_snapshots (
  order_id uuid primary key references public.orders(id) on delete restrict,
  shipping_cents integer not null check (shipping_cents >= 0),
  zone_id uuid references public.shipping_zones(id),
  zone_name text,
  local_free boolean not null,
  package_count integer not null check (package_count > 0),
  calculation_version text not null,
  rule_version integer not null,
  package_snapshot jsonb not null,
  calculated_at timestamptz not null default now()
);

alter table public.shipping_settings enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.shipping_zone_postal_rules enable row level security;
alter table public.shipping_profiles enable row level security;
alter table public.shipping_category_rules enable row level security;
alter table public.shipping_quotes enable row level security;
alter table public.order_shipping_snapshots enable row level security;

revoke all on public.shipping_settings, public.shipping_zones, public.shipping_zone_postal_rules, public.shipping_profiles, public.shipping_category_rules, public.shipping_quotes, public.order_shipping_snapshots from anon, authenticated;

create or replace function private.normalize_canadian_postal(p text)
returns text language sql immutable set search_path='' as $$
  select upper(regexp_replace(coalesce(p,''),'[^A-Za-z0-9]','','g'))
$$;

create or replace function private.valid_canadian_postal(p text)
returns boolean language sql immutable set search_path='' as $$
  select private.normalize_canadian_postal(p) ~ '^[ABCEGHJKLMNPRSTVXY][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$'
$$;

create or replace function private.shipping_calc(p_item_ids uuid[], p_postal text, p_admin_override jsonb default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  s public.shipping_settings%rowtype;
  normalized text := private.normalize_canadian_postal(p_postal);
  fsa text;
  zr public.shipping_zone_postal_rules%rowtype;
  z public.shipping_zones%rowtype;
  rec record;
  profile public.shipping_profiles%rowtype;
  cr public.shipping_category_rules%rowtype;
  actual_g bigint;
  dim_g bigint;
  billable_g bigint;
  packages jsonb := '[]'::jsonb;
  package_count integer := 0;
  total bigint := 0;
  surcharge bigint := 0;
  expected integer;
  local_only boolean := false;
  local_free boolean := false;
  rule_v integer;
begin
  if not private.valid_canadian_postal(p_postal) then
    return jsonb_build_object('status','invalid_postal');
  end if;
  fsa := left(normalized,3);
  select * into s from public.shipping_settings where singleton=true;
  if not found then return jsonb_build_object('status','configuration_error'); end if;
  rule_v := s.rule_version;

  select * into zr from public.shipping_zone_postal_rules
   where fsa_prefix=fsa and active order by priority asc limit 1;
  if found and zr.shipping_disabled then
    return jsonb_build_object('status','unavailable','ruleVersion',rule_v);
  end if;
  local_free := s.free_local_enabled and found and zr.is_local_free;

  expected := cardinality(p_item_ids);
  if expected is null or expected < 1 or expected > 25
     or expected <> (select count(distinct x) from unnest(p_item_ids) x) then
    return jsonb_build_object('status','invalid_items');
  end if;

  if p_admin_override is null and
     (select count(*) from public.items i where i.id=any(p_item_ids) and i.status='listed') <> expected then
    return jsonb_build_object('status','unavailable_items');
  end if;

  if local_free then
    return jsonb_build_object('status','local_free','shippingCents',0,'packageCount',1,'ruleVersion',rule_v,'calculationVersion','internal-v1','expiresInSeconds',s.quote_ttl_seconds);
  end if;
  if not s.canada_wide_enabled then return jsonb_build_object('status','unavailable','ruleVersion',rule_v); end if;
  if not found or zr.zone_id is null then return jsonb_build_object('status','unavailable','ruleVersion',rule_v); end if;
  select * into z from public.shipping_zones where id=zr.zone_id and enabled;
  if not found then return jsonb_build_object('status','unavailable','ruleVersion',rule_v); end if;

  for rec in
    select i.id,i.category,i.subcategory,i.shipping_weight_grams,i.shipping_length_mm,i.shipping_width_mm,i.shipping_height_mm,
           i.shipping_fragile,i.shipping_oversize,i.shipping_separately,i.local_delivery_only,i.shipping_profile_override_id
      from public.items i where i.id=any(p_item_ids) order by i.id
  loop
    select r.* into cr from public.shipping_category_rules r
      where r.active and r.category=rec.category and (r.subcategory=rec.subcategory or r.subcategory is null)
      order by (r.subcategory is not null) desc,r.priority asc limit 1;
    if rec.shipping_profile_override_id is not null then
      select * into profile from public.shipping_profiles where id=rec.shipping_profile_override_id and active;
    elsif found and cr.profile_id is not null then
      select * into profile from public.shipping_profiles where id=cr.profile_id and active;
    else
      return jsonb_build_object('status','configuration_error','missingProfileItemId',rec.id,'ruleVersion',rule_v);
    end if;
    local_only := coalesce(rec.local_delivery_only,profile.local_delivery_only,false);
    if local_only then return jsonb_build_object('status','local_only','ruleVersion',rule_v); end if;

    actual_g := coalesce(rec.shipping_weight_grams,profile.weight_grams);
    dim_g := ceil((coalesce(rec.shipping_length_mm,profile.length_mm)::numeric * coalesce(rec.shipping_width_mm,profile.width_mm)::numeric * coalesce(rec.shipping_height_mm,profile.height_mm)::numeric) / (s.dimensional_divisor::numeric * 1000))::bigint;
    billable_g := greatest(actual_g,dim_g);
    surcharge := coalesce(cr.surcharge_cents,0)
      + case when coalesce(rec.shipping_fragile,profile.fragile,false) then s.fragile_surcharge_cents else 0 end
      + case when coalesce(rec.shipping_oversize,profile.oversize,false) then s.oversize_surcharge_cents else 0 end
      + case when billable_g > s.heavy_threshold_grams then s.heavy_surcharge_cents else 0 end;

    -- Conservative cart packaging: separate/fragile/oversize items always own a parcel.
    -- Compatible ordinary items share a compatibility-group parcel; charge base once below.
    packages := packages || jsonb_build_array(jsonb_build_object(
      'itemId',rec.id,'actualWeightGrams',actual_g,'dimensionalWeightGrams',dim_g,'billableWeightGrams',billable_g,
      'compatibilityGroup',profile.compatibility_group,'separate',coalesce(rec.shipping_separately,profile.ships_separately,false),
      'fragile',coalesce(rec.shipping_fragile,profile.fragile,false),'oversize',coalesce(rec.shipping_oversize,profile.oversize,false),
      'surchargeCents',surcharge));
  end loop;

  select count(*) into package_count from (
    select distinct case
      when (p->>'separate')::boolean or (p->>'fragile')::boolean or (p->>'oversize')::boolean then p->>'itemId'
      else p->>'compatibilityGroup' end k
    from jsonb_array_elements(packages) p
  ) q;
  package_count := greatest(package_count,1);

  -- Each package receives the zone base. Weight and surcharges are item-derived and use integer cents.
  total := z.base_cents * package_count + s.handling_cents;
  select total + coalesce(sum(
    ceil(greatest(0,(p->>'billableWeightGrams')::bigint - 1000)::numeric / 1000)::bigint * z.additional_kg_cents
    + (p->>'surchargeCents')::bigint
  ),0) into total from jsonb_array_elements(packages) p;
  total := greatest(total,s.minimum_cents);
  if s.maximum_cents is not null then total := least(total,s.maximum_cents); end if;

  return jsonb_build_object('status','ok','shippingCents',total::integer,'packageCount',package_count,'zoneId',z.id,'zoneName',z.name,
    'ruleVersion',rule_v,'calculationVersion','internal-v1','expiresInSeconds',s.quote_ttl_seconds,'packages',packages);
exception when others then
  raise warning 'shipping calculation failed: %', sqlstate;
  return jsonb_build_object('status','configuration_error');
end $$;

create or replace function public.quote_shipping(item_ids uuid[], postal_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; qid uuid; fsa text;
begin
  result := private.shipping_calc(item_ids,postal_code,null);
  if result->>'status' in ('ok','local_free') then
    fsa := left(private.normalize_canadian_postal(postal_code),3);
    insert into public.shipping_quotes(requester_id,item_ids,postal_fsa,shipping_cents,status,package_count,zone_id,rule_version,calculation_version,expires_at)
    values(auth.uid(),item_ids,fsa,(result->>'shippingCents')::integer,result->>'status',(result->>'packageCount')::integer,
      nullif(result->>'zoneId','')::uuid,(result->>'ruleVersion')::integer,result->>'calculationVersion',
      now()+make_interval(secs=coalesce((result->>'expiresInSeconds')::integer,1800))) returning id into qid;
    result := result - 'packages' - 'zoneId' - 'zoneName' || jsonb_build_object('quoteId',qid);
  else
    result := result - 'packages' - 'zoneId' - 'zoneName' - 'missingProfileItemId';
  end if;
  return result;
end $$;
revoke all on function public.quote_shipping(uuid[],text) from public;
grant execute on function public.quote_shipping(uuid[],text) to anon,authenticated;

create or replace function public.admin_shipping_state()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_admin_permission('shipping');
 return jsonb_build_object(
  'settings',(select to_jsonb(s) from public.shipping_settings s where singleton=true),
  'zones',(select coalesce(jsonb_agg(to_jsonb(z) order by z.priority,z.name),'[]'::jsonb) from public.shipping_zones z),
  'postalRules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.priority,r.fsa_prefix),'[]'::jsonb) from public.shipping_zone_postal_rules r),
  'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name),'[]'::jsonb) from public.shipping_profiles p),
  'categoryRules',(select coalesce(jsonb_agg(to_jsonb(c) order by c.category,c.subcategory nulls last),'[]'::jsonb) from public.shipping_category_rules c)
 );
end $$;
revoke all on function public.admin_shipping_state() from public;
grant execute on function public.admin_shipping_state() to authenticated;

create or replace function public.admin_shipping_simulate(postal_code text, p_category text, p_subcategory text, weight_grams integer, length_mm integer, width_mm integer, height_mm integer, fragile boolean, oversize boolean, ships_separately boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; p public.shipping_profiles%rowtype; s public.shipping_settings%rowtype; fsa text; zr public.shipping_zone_postal_rules%rowtype; z public.shipping_zones%rowtype; cr public.shipping_category_rules%rowtype; dim_g bigint; billable bigint; total bigint; sur bigint;
begin
 perform private.assert_admin_permission('shipping');
 if not private.valid_canadian_postal(postal_code) then return jsonb_build_object('status','invalid_postal'); end if;
 select * into s from public.shipping_settings where singleton=true;
 fsa:=left(private.normalize_canadian_postal(postal_code),3);
 select * into zr from public.shipping_zone_postal_rules where fsa_prefix=fsa and active order by priority limit 1;
 if found and s.free_local_enabled and zr.is_local_free then return jsonb_build_object('status','local_free','shippingCents',0,'ruleVersion',s.rule_version,'packageCount',1); end if;
 if not found or zr.shipping_disabled or zr.zone_id is null then return jsonb_build_object('status','unavailable','ruleVersion',s.rule_version); end if;
 select * into z from public.shipping_zones where id=zr.zone_id and enabled;
 select * into cr from public.shipping_category_rules r where r.active and r.category=p_category and (r.subcategory=p_subcategory or r.subcategory is null) order by (r.subcategory is not null) desc,r.priority limit 1;
 if cr.profile_id is null then return jsonb_build_object('status','configuration_error'); end if;
 select * into p from public.shipping_profiles where id=cr.profile_id and active;
 weight_grams:=coalesce(weight_grams,p.weight_grams); length_mm:=coalesce(length_mm,p.length_mm); width_mm:=coalesce(width_mm,p.width_mm); height_mm:=coalesce(height_mm,p.height_mm);
 dim_g:=ceil((length_mm::numeric*width_mm*height_mm)/(s.dimensional_divisor::numeric*1000))::bigint; billable:=greatest(weight_grams,dim_g);
 sur:=coalesce(cr.surcharge_cents,0)+case when coalesce(fragile,p.fragile) then s.fragile_surcharge_cents else 0 end+case when coalesce(oversize,p.oversize) then s.oversize_surcharge_cents else 0 end+case when billable>s.heavy_threshold_grams then s.heavy_surcharge_cents else 0 end;
 total:=z.base_cents+s.handling_cents+ceil(greatest(0,billable-1000)::numeric/1000)::bigint*z.additional_kg_cents+sur;
 total:=greatest(total,s.minimum_cents); if s.maximum_cents is not null then total:=least(total,s.maximum_cents); end if;
 return jsonb_build_object('status','ok','zone',z.name,'freeLocal',false,'actualWeightGrams',weight_grams,'dimensionalWeightGrams',dim_g,'billableWeightGrams',billable,'baseCents',z.base_cents,'weightChargeCents',ceil(greatest(0,billable-1000)::numeric/1000)::bigint*z.additional_kg_cents,'handlingCents',s.handling_cents,'surchargeCents',sur,'packageCount',1,'shippingCents',total,'ruleVersion',s.rule_version,'calculationVersion','internal-v1');
end $$;
revoke all on function public.admin_shipping_simulate(text,text,text,integer,integer,integer,integer,boolean,boolean,boolean) from public;
grant execute on function public.admin_shipping_simulate(text,text,text,integer,integer,integer,integer,boolean,boolean,boolean) to authenticated;

create or replace function public.admin_set_item_shipping(p_item uuid,p_weight_grams integer,p_length_mm integer,p_width_mm integer,p_height_mm integer,p_fragile boolean,p_oversize boolean,p_separate boolean,p_local_only boolean,p_profile uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_admin_permission('shipping');
 update public.items set shipping_weight_grams=p_weight_grams,shipping_length_mm=p_length_mm,shipping_width_mm=p_width_mm,shipping_height_mm=p_height_mm,
 shipping_fragile=p_fragile,shipping_oversize=p_oversize,shipping_separately=p_separate,local_delivery_only=p_local_only,shipping_profile_override_id=p_profile where id=p_item;
 if not found then raise exception 'Item not found'; end if;
end $$;
revoke all on function public.admin_set_item_shipping(uuid,integer,integer,integer,integer,boolean,boolean,boolean,boolean,uuid) from public;
grant execute on function public.admin_set_item_shipping(uuid,integer,integer,integer,integer,boolean,boolean,boolean,boolean,uuid) to authenticated;

-- Seed editable defaults only when absent. Prices are intentionally starter configuration, not application constants.
insert into public.shipping_profiles(name,weight_grams,length_mm,width_mm,height_mm,fragile,oversize,ships_separately,compatibility_group) values
 ('Small Apparel Parcel',500,300,220,80,false,false,false,'apparel'),
 ('Medium Apparel Parcel',1000,400,300,120,false,false,false,'apparel'),
 ('Large Apparel Parcel',2000,500,400,180,false,false,false,'apparel'),
 ('Shoe Box Parcel',1500,350,250,150,false,false,false,'shoes'),
 ('Medium Parcel',1500,400,300,200,false,false,false,'general'),
 ('Protected Electronics Parcel',3000,450,350,180,true,false,true,'electronics'),
 ('Small Protected Electronics Parcel',700,250,180,100,true,false,true,'electronics'),
 ('Large Electronics Parcel',7000,700,500,250,true,true,true,'electronics'),
 ('Fragile Home & Decor Parcel',2500,450,350,300,true,false,true,'home-fragile'),
 ('Oversize Home & Decor Parcel',8000,800,500,500,true,true,true,'home-oversize')
on conflict(name) do nothing;

-- Preserve centralized taxonomy: rules reference existing category/subcategory strings; no taxonomy table is duplicated.
insert into public.shipping_category_rules(category,subcategory,profile_id,priority)
select v.category,v.subcategory,p.id,v.priority from (values
 ('women',null::text,'Medium Apparel Parcel',100),('men',null,'Medium Apparel Parcel',100),('kids',null,'Small Apparel Parcel',100),
 ('shoes',null,'Shoe Box Parcel',100),('accessories',null,'Medium Parcel',100),('electronics',null,'Protected Electronics Parcel',100),
 ('home_decor',null,'Fragile Home & Decor Parcel',100),
 ('electronics','Smartphones','Small Protected Electronics Parcel',10),('electronics','Laptops','Protected Electronics Parcel',10),('electronics','Monitors','Large Electronics Parcel',10),
 ('home_decor','Vases','Fragile Home & Decor Parcel',10),('home_decor','Small Lamps & Lighting','Oversize Home & Decor Parcel',10)
) as v(category,subcategory,profile_name,priority)
join public.shipping_profiles p on p.name=v.profile_name
on conflict(category,subcategory) do nothing;

-- Checkout remains atomic and now calculates shipping authoritatively immediately before order creation.
create or replace function public.create_checkout_order(
  item_ids uuid[], recipient_name text, address_line1 text, address_line2 text, city text, province text, postal_code text
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); oid uuid; expected_count integer; available_count integer; active_count integer; subtotal integer;
 reservation_until timestamptz:=now()+interval '10 minutes'; ship jsonb; shipping integer; packages jsonb; zone uuid;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 expected_count:=cardinality(item_ids);
 if expected_count is null or expected_count<1 or expected_count>25 then raise exception 'Cart must contain 1 to 25 items'; end if;
 if expected_count<>(select count(distinct x) from unnest(item_ids)x) then raise exception 'Duplicate items are not allowed'; end if;
 if char_length(trim(recipient_name)) not between 2 and 120 or char_length(trim(address_line1)) not between 5 and 200 or char_length(trim(city)) not between 2 and 100 or not private.valid_canadian_postal(postal_code) then raise exception 'Invalid shipping address'; end if;
 update public.inventory_reservations set status='expired',updated_at=now() where status='active' and expires_at<=now() and (item_id=any(item_ids) or buyer_id=uid);
 perform i.id from public.items i where i.id=any(item_ids) order by i.id for update;
 select count(*),coalesce(sum(coalesce(i.listed_price_cents,i.initial_approved_price_cents)),0) into available_count,subtotal from public.items i where i.id=any(item_ids) and i.status='listed' and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null;
 if available_count<>expected_count then raise exception 'One or more items are no longer available'; end if;
 if exists(select 1 from public.inventory_reservations r where r.item_id=any(item_ids) and r.status='active' and r.expires_at>now()) then raise exception 'One or more items are temporarily reserved'; end if;
 select count(*) into active_count from public.inventory_reservations r where r.buyer_id=uid and r.status='active' and r.expires_at>now();
 if active_count+expected_count>25 then raise exception 'Too many active checkout reservations'; end if;

 ship:=private.shipping_calc(item_ids,postal_code,null);
 if ship->>'status' not in ('ok','local_free') then
   if ship->>'status'='local_only' then raise exception 'This item is available for local delivery only'; end if;
   raise exception 'Shipping is currently unavailable to this postal code';
 end if;
 shipping:=(ship->>'shippingCents')::integer; packages:=coalesce(ship->'packages','[]'::jsonb); zone:=nullif(ship->>'zoneId','')::uuid;

 insert into public.orders(buyer_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,recipient_name,address_line1,address_line2,city,province,postal_code,reservation_expires_at)
 values(uid,'awaiting_payment','not_configured',subtotal,shipping,subtotal+shipping,trim(recipient_name),trim(address_line1),nullif(trim(address_line2),''),trim(city),trim(province),private.normalize_canadian_postal(postal_code),reservation_until) returning id into oid;
 insert into public.order_items(order_id,item_id,item_name,brand,size,item_condition,unit_price_cents)
 select oid,i.id,i.name,coalesce(i.brand,'Unbranded'),i.size,i.item_condition,coalesce(i.listed_price_cents,i.initial_approved_price_cents) from public.items i where i.id=any(item_ids) and i.status='listed';
 insert into public.inventory_reservations(order_id,item_id,buyer_id,status,expires_at) select oid,i.id,uid,'active',reservation_until from public.items i where i.id=any(item_ids) order by i.id;
 insert into public.order_shipping_snapshots(order_id,shipping_cents,zone_id,zone_name,local_free,package_count,calculation_version,rule_version,package_snapshot)
 values(oid,shipping,zone,ship->>'zoneName',ship->>'status'='local_free',coalesce((ship->>'packageCount')::integer,1),ship->>'calculationVersion',(ship->>'ruleVersion')::integer,packages);
 return oid;
end $$;


drop function if exists public.admin_update_shipping_settings(jsonb);
create or replace function public.admin_update_shipping_engine_settings(p jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_admin_permission('shipping');
 update public.shipping_settings set
  canada_wide_enabled=coalesce((p->>'canada_wide_enabled')::boolean,canada_wide_enabled),
  free_local_enabled=coalesce((p->>'free_local_enabled')::boolean,free_local_enabled),
  dimensional_divisor=coalesce((p->>'dimensional_divisor')::integer,dimensional_divisor),
  handling_cents=coalesce((p->>'handling_cents')::integer,handling_cents),
  minimum_cents=coalesce((p->>'minimum_cents')::integer,minimum_cents),
  maximum_cents=case when p ? 'maximum_cents' then nullif(p->>'maximum_cents','')::integer else maximum_cents end,
  heavy_threshold_grams=coalesce((p->>'heavy_threshold_grams')::integer,heavy_threshold_grams),
  heavy_surcharge_cents=coalesce((p->>'heavy_surcharge_cents')::integer,heavy_surcharge_cents),
  oversize_surcharge_cents=coalesce((p->>'oversize_surcharge_cents')::integer,oversize_surcharge_cents),
  fragile_surcharge_cents=coalesce((p->>'fragile_surcharge_cents')::integer,fragile_surcharge_cents),
  quote_ttl_seconds=coalesce((p->>'quote_ttl_seconds')::integer,quote_ttl_seconds),
  rule_version=rule_version+1,updated_at=now()
 where singleton=true;
end $$;
revoke all on function public.admin_update_shipping_engine_settings(jsonb) from public;
grant execute on function public.admin_update_shipping_engine_settings(jsonb) to authenticated;

create or replace function public.admin_upsert_shipping_zone(p jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid:=nullif(p->>'id','')::uuid;
begin
 perform private.assert_admin_permission('shipping');
 if rid is null then
  insert into public.shipping_zones(name,base_cents,additional_kg_cents,enabled,priority,rule_version)
  values(trim(p->>'name'),(p->>'base_cents')::integer,(p->>'additional_kg_cents')::integer,coalesce((p->>'enabled')::boolean,true),coalesce((p->>'priority')::integer,100),(select rule_version+1 from public.shipping_settings where singleton=true))
  returning id into rid;
 else
  update public.shipping_zones set name=trim(p->>'name'),base_cents=(p->>'base_cents')::integer,additional_kg_cents=(p->>'additional_kg_cents')::integer,enabled=coalesce((p->>'enabled')::boolean,enabled),priority=coalesce((p->>'priority')::integer,priority),rule_version=(select rule_version+1 from public.shipping_settings where singleton=true),updated_at=now() where id=rid;
 end if;
 update public.shipping_settings set rule_version=rule_version+1,updated_at=now() where singleton=true;
 return rid;
end $$;
revoke all on function public.admin_upsert_shipping_zone(jsonb) from public;
grant execute on function public.admin_upsert_shipping_zone(jsonb) to authenticated;

create or replace function public.admin_upsert_shipping_postal_rule(p jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid:=nullif(p->>'id','')::uuid; fsa text:=upper(trim(p->>'fsa_prefix'));
begin
 perform private.assert_admin_permission('shipping');
 if fsa !~ '^[ABCEGHJKLMNPRSTVXY][0-9][ABCEGHJKLMNPRSTVWXYZ]$' then raise exception 'Invalid FSA'; end if;
 if rid is null then
  insert into public.shipping_zone_postal_rules(zone_id,fsa_prefix,is_local_free,shipping_disabled,active,priority,rule_version)
  values(nullif(p->>'zone_id','')::uuid,fsa,coalesce((p->>'is_local_free')::boolean,false),coalesce((p->>'shipping_disabled')::boolean,false),coalesce((p->>'active')::boolean,true),coalesce((p->>'priority')::integer,100),(select rule_version+1 from public.shipping_settings where singleton=true)) returning id into rid;
 else
  update public.shipping_zone_postal_rules set zone_id=nullif(p->>'zone_id','')::uuid,fsa_prefix=fsa,is_local_free=coalesce((p->>'is_local_free')::boolean,is_local_free),shipping_disabled=coalesce((p->>'shipping_disabled')::boolean,shipping_disabled),active=coalesce((p->>'active')::boolean,active),priority=coalesce((p->>'priority')::integer,priority),rule_version=(select rule_version+1 from public.shipping_settings where singleton=true) where id=rid;
 end if;
 update public.shipping_settings set rule_version=rule_version+1,updated_at=now() where singleton=true; return rid;
end $$;
revoke all on function public.admin_upsert_shipping_postal_rule(jsonb) from public;
grant execute on function public.admin_upsert_shipping_postal_rule(jsonb) to authenticated;

create or replace function public.admin_upsert_shipping_profile(p jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid:=nullif(p->>'id','')::uuid;
begin
 perform private.assert_admin_permission('shipping');
 if rid is null then
  insert into public.shipping_profiles(name,weight_grams,length_mm,width_mm,height_mm,fragile,oversize,ships_separately,local_delivery_only,compatibility_group,active,rule_version)
  values(trim(p->>'name'),(p->>'weight_grams')::integer,(p->>'length_mm')::integer,(p->>'width_mm')::integer,(p->>'height_mm')::integer,coalesce((p->>'fragile')::boolean,false),coalesce((p->>'oversize')::boolean,false),coalesce((p->>'ships_separately')::boolean,false),coalesce((p->>'local_delivery_only')::boolean,false),coalesce(nullif(trim(p->>'compatibility_group'),''),'general'),coalesce((p->>'active')::boolean,true),(select rule_version+1 from public.shipping_settings where singleton=true)) returning id into rid;
 else
  update public.shipping_profiles set name=trim(p->>'name'),weight_grams=(p->>'weight_grams')::integer,length_mm=(p->>'length_mm')::integer,width_mm=(p->>'width_mm')::integer,height_mm=(p->>'height_mm')::integer,fragile=coalesce((p->>'fragile')::boolean,fragile),oversize=coalesce((p->>'oversize')::boolean,oversize),ships_separately=coalesce((p->>'ships_separately')::boolean,ships_separately),local_delivery_only=coalesce((p->>'local_delivery_only')::boolean,local_delivery_only),compatibility_group=coalesce(nullif(trim(p->>'compatibility_group'),''),compatibility_group),active=coalesce((p->>'active')::boolean,active),rule_version=(select rule_version+1 from public.shipping_settings where singleton=true) where id=rid;
 end if;
 update public.shipping_settings set rule_version=rule_version+1,updated_at=now() where singleton=true; return rid;
end $$;
revoke all on function public.admin_upsert_shipping_profile(jsonb) from public;
grant execute on function public.admin_upsert_shipping_profile(jsonb) to authenticated;

create or replace function public.admin_upsert_shipping_category_rule(p jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid:=nullif(p->>'id','')::uuid;
begin
 perform private.assert_admin_permission('shipping');
 if rid is null then
  insert into public.shipping_category_rules(category,subcategory,profile_id,surcharge_cents,active,priority,rule_version)
  values(p->>'category',nullif(p->>'subcategory',''),nullif(p->>'profile_id','')::uuid,coalesce((p->>'surcharge_cents')::integer,0),coalesce((p->>'active')::boolean,true),coalesce((p->>'priority')::integer,100),(select rule_version+1 from public.shipping_settings where singleton=true)) returning id into rid;
 else
  update public.shipping_category_rules set category=p->>'category',subcategory=nullif(p->>'subcategory',''),profile_id=nullif(p->>'profile_id','')::uuid,surcharge_cents=coalesce((p->>'surcharge_cents')::integer,surcharge_cents),active=coalesce((p->>'active')::boolean,active),priority=coalesce((p->>'priority')::integer,priority),rule_version=(select rule_version+1 from public.shipping_settings where singleton=true) where id=rid;
 end if;
 update public.shipping_settings set rule_version=rule_version+1,updated_at=now() where singleton=true; return rid;
end $$;
revoke all on function public.admin_upsert_shipping_category_rule(jsonb) from public;
grant execute on function public.admin_upsert_shipping_category_rule(jsonb) to authenticated;

create or replace function public.admin_item_shipping_overrides()
returns table(item_id uuid,weight_grams integer,length_mm integer,width_mm integer,height_mm integer,fragile boolean,oversize boolean,ships_separately boolean,local_delivery_only boolean,profile_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_admin_permission('shipping');
 return query select i.id,i.shipping_weight_grams,i.shipping_length_mm,i.shipping_width_mm,i.shipping_height_mm,i.shipping_fragile,i.shipping_oversize,i.shipping_separately,i.local_delivery_only,i.shipping_profile_override_id from public.items i order by i.created_at desc;
end $$;
revoke all on function public.admin_item_shipping_overrides() from public;
grant execute on function public.admin_item_shipping_overrides() to authenticated;
