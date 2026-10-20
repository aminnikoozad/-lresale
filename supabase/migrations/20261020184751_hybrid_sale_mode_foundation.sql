-- P1 only. Additive foundation; does not enable marketplace publication or payment.
-- Existing records remain managed inventory. No fee or financial history is rewritten.
alter table public.items
 add column sale_mode text not null default 'managed_consignment'
   check(sale_mode in ('managed_consignment','peer_to_peer')),
 add column physical_custody text not null default 'team'
   check(physical_custody in ('team','seller')),
 add column shipping_responsibility text not null default 'team'
   check(shipping_responsibility in ('team','seller')),
 add column listing_version integer not null default 1 check(listing_version>0),
 add column marketplace_details jsonb not null default '{}' check(jsonb_typeof(marketplace_details)='object');
-- owner_id is the economic owner. Display identity will use a public seller projection,
-- never the auth profile or the private shipping address.
create index items_sale_mode_owner_idx on public.items(sale_mode,owner_id,updated_at desc);
revoke update(sale_mode,physical_custody,shipping_responsibility,listing_version,marketplace_details) on public.items from authenticated;

-- Use the existing version registry. These values are explicitly an unapproved proposal.
insert into public.business_setting_versions(setting_key,version,value,reason)
values('marketplace_policy',1,'{"status":"staging_proposal","commercialApproved":false,"newPurchasesEnabled":false,"directMinimumCents":800,"commissionBps":1500,"minimumCommissionCents":150,"commissionScope":"seller_suborder","offerHours":24,"reservationMinutes":15,"dispatchBusinessDays":5,"reviewHours":72,"returnBusinessDays":5,"currency":"CAD","timezone":"America/Toronto"}',
 'Unapproved marketplace proposal; no commercial activation');

create function private.guard_hybrid_item() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.sale_mode,new.owner_id) is distinct from (old.sale_mode,old.owner_id) then
   raise exception 'Sale mode and economic owner are immutable; conversion requires a separate intake workflow';
 end if;
 if new.sale_mode='managed_consignment' then
   if new.physical_custody<>'team' or new.shipping_responsibility<>'team' or new.marketplace_details<>'{}'::jsonb then
     raise exception 'Managed inventory must use the managed workflow';
   end if;
   return new;
 end if;
 if auth.uid() is null or new.owner_id<>auth.uid() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   raise exception 'Only the authenticated owner may edit direct drafts';
 end if;
 if new.physical_custody<>'seller' or new.shipping_responsibility<>'seller' or new.collection_request_id is not null then
   raise exception 'Direct inventory stays with its seller and cannot have a Bag';
 end if;
 if new.status not in ('listing_preparation','archived') or new.published_at is not null or new.first_published_at is not null then
   raise exception 'Marketplace publication and purchase are disabled pending commissioning';
 end if;
 if new.inspected_at is not null or new.pricing_authority<>'seller' or new.seller_pricing_approved_at is not null
    or new.initial_approved_price_cents is not null or new.sold_price_cents is not null
    or new.locked_seller_commission_bps is not null or new.locked_platform_commission_bps is not null
    or new.locked_commission_rule_version is not null or new.locked_commission_tier is not null
    or new.final_seller_earnings_cents is not null or new.final_platform_earnings_cents is not null then
   raise exception 'Direct drafts cannot claim team inspection, locked commissions or financial completion';
 end if;
 if tg_op='UPDATE' then
   if exists(select 1 from public.inventory_reservations where item_id=old.id and status='active')
      or exists(select 1 from public.order_items where item_id=old.id) then
     raise exception 'Inventory with a reservation or order is locked';
   end if;
   if (new.name,new.brand,new.category,new.subcategory,new.size,new.item_condition,new.color,new.material,
       new.description,new.condition_notes,new.photo_urls,new.listed_price_cents,new.marketplace_details)
      is distinct from
      (old.name,old.brand,old.category,old.subcategory,old.size,old.item_condition,old.color,old.material,
       old.description,old.condition_notes,old.photo_urls,old.listed_price_cents,old.marketplace_details) then
     new.listing_version:=old.listing_version+1;
   else new.listing_version:=old.listing_version; end if;
 else new.listing_version:=1;
 end if;
 return new;
end $$;
revoke all on function private.guard_hybrid_item() from public,anon,authenticated;
create trigger aa_items_guard_hybrid before insert or update on public.items
for each row execute function private.guard_hybrid_item();

-- Keep the existing managed automation, but never enroll direct inventory in it.
drop trigger items_sync_rewear_operations on public.items;
create trigger items_sync_rewear_operations
 after insert or update of status,inspected_at,photo_urls,initial_approved_price_cents,listed_price_cents,seller_pricing_approved_at,published_at
 on public.items for each row when(new.sale_mode='managed_consignment') execute function private.sync_item_operation();
create function private.guard_managed_operation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.items where id=new.item_id and sale_mode='managed_consignment') then
   raise exception 'Managed operations cannot enroll direct inventory';
 end if;
 return new;
end $$;
revoke all on function private.guard_managed_operation() from public,anon,authenticated;
create trigger aa_managed_operation_only before insert or update on public.item_operations
for each row execute function private.guard_managed_operation();

-- Explicit allowlist: owner/mode/status/inspection/payment fields are never accepted.
create function public.save_marketplace_draft(p_item uuid,p_expected_version integer,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.items%rowtype; v uuid; k text; b text; price integer; details jsonb;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
 if jsonb_typeof(p_fields) is distinct from 'object' or octet_length(p_fields::text)>16000 then raise exception 'Invalid draft'; end if;
 for k in select jsonb_object_keys(p_fields) loop
   if k not in ('name','brand_kind','brand','category','subcategory','size','size_system','item_condition','color','material','description','condition_notes','price_cents','label_absent','measurements') then raise exception 'Unsupported draft field'; end if;
   if k not in ('price_cents','label_absent','measurements') and jsonb_typeof(p_fields->k) not in ('string','null') then raise exception 'Text field required'; end if;
 end loop;
 if length(trim(coalesce(p_fields->>'name',''))) not between 2 and 160 then raise exception 'Title required (2-160 characters)'; end if;
 if p_fields->>'category' is null or p_fields->>'category' not in ('women','men','kids') then raise exception 'Choose a clothing category'; end if;
 if p_fields->>'brand_kind' is null or p_fields->>'brand_kind' not in ('unbranded','other','unknown') then raise exception 'Choose brand status'; end if;
 b:=case p_fields->>'brand_kind' when 'other' then nullif(trim(p_fields->>'brand'),'') when 'unbranded' then 'Unbranded' else null end;
 if (p_fields->>'brand_kind'='other' and b is null) or length(b)>100 then raise exception 'Other brand requires text (maximum 100 characters)'; end if;
 if length(coalesce(p_fields->>'description',''))>2000 or length(coalesce(p_fields->>'condition_notes',''))>1000
    or length(coalesce(p_fields->>'size',''))>40 or length(coalesce(p_fields->>'item_condition',''))>80
    or length(coalesce(p_fields->>'color',''))>80 or length(coalesce(p_fields->>'material',''))>100
    or length(coalesce(p_fields->>'size_system',''))>40 or length(coalesce(p_fields->>'subcategory',''))>100 then raise exception 'Draft field too long'; end if;
 if p_fields->'price_cents' is not null and p_fields->'price_cents'<>'null'::jsonb then
   if jsonb_typeof(p_fields->'price_cents')<>'number' or (p_fields->>'price_cents')!~'^[0-9]+$' then raise exception 'Use integer cents'; end if;
   price:=(p_fields->>'price_cents')::integer;
   if price not between 1 and 100000000 then raise exception 'Invalid price'; end if;
 end if;
 if p_fields ? 'label_absent' and jsonb_typeof(p_fields->'label_absent')<>'boolean' then raise exception 'Invalid label declaration'; end if;
 details:=jsonb_build_object('brandKind',p_fields->>'brand_kind','sizeSystem',nullif(trim(p_fields->>'size_system'),''),'labelAbsent',coalesce((p_fields->>'label_absent')::boolean,false),'measurements',coalesce(p_fields->'measurements','{}'::jsonb));
 if jsonb_typeof(details->'measurements')<>'object' then raise exception 'Invalid measurements'; end if;
 for k in select jsonb_object_keys(details->'measurements') loop
   if k not in ('chest','waist','hip','length','sleeve','inseam','shoulder') or jsonb_typeof(details->'measurements'->k)<>'number'
      or (details->'measurements'->>k)::numeric not between 0.1 and 500 then raise exception 'Use measured centimetres'; end if;
 end loop;
 if p_item is null then
   if p_expected_version is distinct from 0 then raise exception 'New drafts start at version zero'; end if;
   -- Serialize per seller to bound draft creation, including concurrent requests.
   perform 1 from auth.users where id=auth.uid() for update;
   if (select count(*) from public.items where owner_id=auth.uid() and sale_mode='peer_to_peer' and status<>'archived')>=200 then raise exception 'Draft limit reached'; end if;
   insert into public.items(owner_id,name,category,sale_mode,physical_custody,shipping_responsibility,status)
   values(auth.uid(),trim(p_fields->>'name'),p_fields->>'category','peer_to_peer','seller','seller','listing_preparation') returning id into v;
 else
   select * into i from public.items where id=p_item and owner_id=auth.uid() and sale_mode='peer_to_peer' for update;
   if not found then raise exception 'Draft unavailable'; end if;
   if i.status<>'listing_preparation' or i.listing_version is distinct from p_expected_version then raise exception 'Draft changed; refresh before saving'; end if;
   v:=i.id;
 end if;
 update public.items set name=trim(p_fields->>'name'),brand=b,category=p_fields->>'category',subcategory=nullif(trim(p_fields->>'subcategory'),''),
   size=nullif(trim(p_fields->>'size'),''),item_condition=nullif(trim(p_fields->>'item_condition'),''),color=nullif(trim(p_fields->>'color'),''),material=nullif(trim(p_fields->>'material'),''),
   description=nullif(trim(p_fields->>'description'),''),condition_notes=nullif(trim(p_fields->>'condition_notes'),''),listed_price_cents=price,marketplace_details=details,updated_at=now()
 where id=v returning * into i;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(auth.uid(),'marketplace.draft_saved','item',v::text,jsonb_build_object('version',i.listing_version,'saleMode',i.sale_mode),'Owner saved a private direct-sale draft');
 return jsonb_build_object('id',v,'version',i.listing_version);
end $$;
revoke all on function public.save_marketplace_draft(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_marketplace_draft(uuid,integer,jsonb) to authenticated;

create function public.my_marketplace_drafts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc) from (
   select id,name,brand,category,subcategory,size,item_condition,color,material,description,condition_notes,listed_price_cents,marketplace_details,listing_version,status,updated_at
   from public.items where owner_id=auth.uid() and sale_mode='peer_to_peer' order by updated_at desc limit 200
 )r),'[]'::jsonb);
end $$;
revoke all on function public.my_marketplace_drafts() from public,anon;
grant execute on function public.my_marketplace_drafts() to authenticated;
