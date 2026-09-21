-- Additive managed-resale extension. Existing catalog signatures and commission functions stay intact.
alter table public.items drop constraint items_category;
alter table public.items add constraint items_category check(category in ('women','men','kids','electronics','shoes','accessories','home_decor'));
alter table public.collection_requests drop constraint collection_category;
alter table public.collection_requests add constraint collection_category check(category in ('clothing','shoes','electronics','home_decor'));
alter table public.collection_requests add column home_intake jsonb not null default '{}'::jsonb check(jsonb_typeof(home_intake)='object' and octet_length(home_intake::text)<=8000);

create table public.home_subcategories (name text primary key, active boolean not null default true);
insert into public.home_subcategories(name) values ('Decor'),('Wall Art'),('Vases'),('Candle Holders'),('Decorative Objects'),('Trays'),('Small Lamps'),('Clocks'),('Tableware & Decorative Dishes'),('Bookends'),('Vintage'),('Collectibles'),('Vintage & Collectibles');
insert into public.home_subcategories(name,active) values ('Antiques',false);
create table public.home_acceptance_rules (
 category text primary key default 'home_decor', minimum_value_cents integer check(minimum_value_cents between 1 and 100000000),
 bundle_eligible boolean not null default true, allow_oversized boolean not null default false,
 updated_at timestamptz not null default now()
);
-- NULL inherits the current approved selling minimum. No new monetary policy is invented.
insert into public.home_acceptance_rules(category) values ('home_decor');
create table public.home_item_details (
 item_id uuid primary key references public.items(id) on delete cascade,
 public_data jsonb not null default '{}' check(jsonb_typeof(public_data)='object' and octet_length(public_data::text)<=24000),
 staff_data jsonb not null default '{}' check(jsonb_typeof(staff_data)='object' and octet_length(staff_data::text)<=40000),
 checks jsonb not null default '{}' check(jsonb_typeof(checks)='object'),
 photos jsonb not null default '[]' check(jsonb_typeof(photos)='array' and jsonb_array_length(photos)<=8),
 inspection_stage text not null default 'Received' check(inspection_stage in ('Received','Initial Review','Category Identification','Condition Inspection','Measurements','Maker / Mark Review','Photography','Pricing Review','Seller Approval','Needs Specialist Review','Compliance Review Required','Ready to List','Published')),
 compliance_flags text[] not null default '{}', defects text[] not null default '{}', rejection_reason text,
 updated_at timestamptz not null default now()
);
create index home_stage_idx on public.home_item_details(inspection_stage);
create index home_subcategory_idx on public.home_item_details((public_data->>'subcategory'));
alter table public.home_subcategories enable row level security;
alter table public.home_acceptance_rules enable row level security;
alter table public.home_item_details enable row level security;
revoke all on public.home_subcategories,public.home_acceptance_rules,public.home_item_details from anon,authenticated;
grant select on public.home_subcategories,public.home_acceptance_rules to anon,authenticated;
grant select on public.home_item_details to authenticated;
create policy home_categories_read on public.home_subcategories for select to anon,authenticated using(active or public.can_manage_items());
create policy home_rules_read on public.home_acceptance_rules for select to anon,authenticated using(true);
create policy home_details_staff_read on public.home_item_details for select to authenticated using(public.can_manage_items());

create function private.home_public_data(d jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(d) where key=any(array['subcategory','designer','material','primary_colour','secondary_colour','style','height_cm','width_cm','depth_cm','diameter_cm','weight_kg','era','approximate_year','country_of_origin','handmade','signed_marked','model_collection','condition','condition_notes','visible_defects','missing_components','restoration_history','fragile','oversized','shipping_restrictions','pickup_only','delivery_note','provenance_notes','authentication_status','keywords']) and value<>'null'::jsonb and value<>'""'::jsonb;
$$;
revoke all on function private.home_public_data(jsonb) from public,anon,authenticated;

create function private.home_missing(p_item uuid) returns text[] language plpgsql stable security definer set search_path='' as $$
declare h public.home_item_details%rowtype; i public.items%rowtype; r public.home_acceptance_rules%rowtype; missing text[]:='{}'; k text;
begin
 select * into i from public.items where id=p_item;
 select * into h from public.home_item_details where item_id=p_item;
 if not found then return array['Home inspection']; end if;
 select * into r from public.home_acceptance_rules where category='home_decor';
 foreach k in array array['subcategory','material','condition','condition_notes','era','delivery_note'] loop
 if nullif(trim(h.public_data->>k),'') is null then missing:=array_append(missing,k); end if; end loop;
 if not exists(select 1 from public.home_subcategories where name=h.public_data->>'subcategory' and active) then missing:=array_append(missing,'Active subcategory'); end if;
 if coalesce((h.public_data->>'height_cm')::numeric,0)<=0 or (coalesce((h.public_data->>'diameter_cm')::numeric,0)<=0 and (coalesce((h.public_data->>'width_cm')::numeric,0)<=0 or coalesce((h.public_data->>'depth_cm')::numeric,0)<=0)) then missing:=array_append(missing,'Measurements'); end if;
 foreach k in array array['clean','structurally_sound','suitable_for_resale','no_severe_damage','shippable','inspectable','resale_permitted','marks_reviewed','inspection_complete','shipping_reviewed'] loop
 if coalesce((h.checks->>k)::boolean,false) is not true then missing:=array_append(missing,k); end if; end loop;
 if coalesce(cardinality(i.photo_urls),0)<>jsonb_array_length(h.photos) then missing:=array_append(missing,'Photo roles'); end if;
 if (select count(*) from jsonb_array_elements(h.photos) p where p->>'role'='hero')<>1 then missing:=array_append(missing,'One hero photo'); end if;
 if (cardinality(h.defects)>0 or nullif(h.public_data->>'visible_defects','') is not null) and not exists(select 1 from jsonb_array_elements(h.photos) p where p->>'role'='defect') then missing:=array_append(missing,'Defect photos'); end if;
 if coalesce((h.public_data->>'signed_marked')::boolean,false) and not exists(select 1 from jsonb_array_elements(h.photos) p where p->>'role' in ('maker mark','label')) then missing:=array_append(missing,'Maker mark photo'); end if;
 if h.public_data->>'subcategory'='Small Lamps' and nullif(h.staff_data->>'electrical_condition','') is null then missing:=array_append(missing,'Electrical inspection'); end if;
 if cardinality(h.compliance_flags)>0 and (coalesce((h.checks->>'compliance_reviewed')::boolean,false)=false or length(coalesce(h.staff_data->>'compliance_review_notes',''))<10) then missing:=array_append(missing,'Compliance Review Required'); end if;
 if h.public_data->>'authentication_status'='Needs Specialist Review' or (coalesce((h.staff_data->>'specialist_review_required')::boolean,false) and (not coalesce((h.checks->>'specialist_reviewed')::boolean,false) or length(coalesce(h.staff_data->>'specialist_review_notes',''))<10)) or h.inspection_stage='Needs Specialist Review' then missing:=array_append(missing,'Needs Specialist Review'); end if;
 if h.public_data->>'authentication_status'='Authenticated' and (coalesce((h.checks->>'specialist_reviewed')::boolean,false)=false or length(coalesce(h.staff_data->>'authentication_evidence',''))<10) then missing:=array_append(missing,'Authentication evidence'); end if;
 if coalesce((h.public_data->>'oversized')::boolean,false) and not r.allow_oversized then missing:=array_append(missing,'Oversized restriction'); end if;
 if coalesce(i.initial_approved_price_cents,0) < coalesce(r.minimum_value_cents,(public.get_selling_rules()->>'minimumIndividualItemValueCents')::integer) then missing:=array_append(missing,'Minimum value; review bundle eligibility'); end if;
 if not coalesce((h.public_data->>'pickup_only')::boolean,false) then
 foreach k in array array['weight_kg'] loop if coalesce((h.public_data->>k)::numeric,0)<=0 then missing:=array_append(missing,k); end if; end loop;
 foreach k in array array['packaged_length_cm','packaged_width_cm','packaged_height_cm','packaged_weight_kg'] loop if coalesce((h.staff_data->>k)::numeric,0)<=0 then missing:=array_append(missing,k); end if; end loop;
 end if;
 if h.rejection_reason is not null then missing:=array_append(missing,'Rejected item'); end if;
 if i.seller_pricing_approved_at is null then missing:=array_append(missing,'Seller price approval'); end if;
 if h.inspection_stage not in ('Ready to List','Published') then missing:=array_append(missing,'Ready to List stage'); end if;
 return missing;
end $$;
revoke all on function private.home_missing(uuid) from public,anon,authenticated;

create function public.admin_home_items() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('name',i.name,'brand',i.brand,'status',i.status,'photo_urls',i.photo_urls,'seller_intake',coalesce(cr.home_intake,'{}'::jsonb),'missing',private.home_missing(i.id)) order by h.updated_at desc),'[]'::jsonb)
 from public.home_item_details h join public.items i on i.id=h.item_id left join public.collection_requests cr on cr.id=i.collection_request_id where public.can_manage_items();
$$;
revoke all on function public.admin_home_items() from public,anon;
grant execute on function public.admin_home_items() to authenticated;

create function public.home_catalog_details(target_item_id uuid default null) returns table(item_id uuid,details jsonb,photos jsonb,price_drop boolean) language sql stable security definer set search_path='' as $$
 select i.id,private.home_public_data(h.public_data)||jsonb_build_object('disclosed_defects',to_jsonb(h.defects)),h.photos,coalesce(i.listed_price_cents<i.initial_approved_price_cents,false)
 from public.items i join public.home_item_details h on h.item_id=i.id where i.category='home_decor' and i.status='listed' and (target_item_id is null or i.id=target_item_id);
$$;
revoke all on function public.home_catalog_details(uuid) from public;
grant execute on function public.home_catalog_details(uuid) to anon,authenticated;

create function public.admin_save_home_rules(p_minimum integer,p_bundle boolean,p_oversized boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.can_manage_items() or not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Owner/Admin permission required'; end if;
 update public.home_acceptance_rules set minimum_value_cents=p_minimum,bundle_eligible=p_bundle,allow_oversized=p_oversized,updated_at=now() where category='home_decor';
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value) values(auth.uid(),'home.rules.updated','category','home_decor',jsonb_build_object('minimum',p_minimum,'bundle',p_bundle,'oversized',p_oversized));
end $$;
revoke all on function public.admin_save_home_rules(integer,boolean,boolean) from public,anon;
grant execute on function public.admin_save_home_rules(integer,boolean,boolean) to authenticated;

create function public.admin_save_home_item(p_item uuid,p_data jsonb,p_photos jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare k text; v jsonb; i public.items%rowtype; h public.home_item_details%rowtype; public_fields jsonb:=coalesce(p_data->'public_data','{}'); staff_fields jsonb:=coalesce(p_data->'staff_data','{}'); photo_list jsonb; urls text[];
begin
 if auth.uid() is null or not public.can_manage_items() then raise exception 'Item management permission required'; end if;
 select * into i from public.items where id=p_item and category='home_decor' for update;
 if not found then raise exception 'Home item not found'; end if;
 if i.status in ('sold','reserved') then raise exception 'Reserved/sold item cannot be edited'; end if;
 select * into h from public.home_item_details where item_id=p_item;
 if jsonb_typeof(public_fields)<>'object' or jsonb_typeof(staff_fields)<>'object' or jsonb_typeof(coalesce(p_data->'checks','{}'))<>'object' then raise exception 'Invalid inspection data'; end if;
 if not (h.compliance_flags <@ array(select jsonb_array_elements_text(coalesce(p_data->'compliance_flags','[]')))) and not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Owner/Admin required to remove compliance flags'; end if;
 if private.home_public_data(public_fields) <> jsonb_strip_nulls(public_fields) then raise exception 'Unrecognized public field'; end if;
 for k,v in select * from jsonb_each(public_fields) loop
 if k in ('height_cm','width_cm','depth_cm','diameter_cm','weight_kg','approximate_year') then
 if jsonb_typeof(v)<>'number' or (v::text)::numeric<=0 or (v::text)::numeric>100000 then raise exception 'Invalid measurement'; end if;
 elsif k in ('handmade','signed_marked','fragile','oversized','pickup_only') then if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid flag'; end if;
 elsif jsonb_typeof(v)<>'string' or length(v::text)>2002 then raise exception 'Invalid text'; end if;
 end loop;
 foreach k in array array['packaged_length_cm','packaged_width_cm','packaged_height_cm','packaged_weight_kg'] loop
 if staff_fields ? k and (jsonb_typeof(staff_fields->k)<>'number' or (staff_fields->>k)::numeric<=0 or (staff_fields->>k)::numeric>100000) then raise exception 'Invalid packaging measurement'; end if; end loop;
 if public_fields ? 'subcategory' and not exists(select 1 from public.home_subcategories where name=public_fields->>'subcategory' and active) then raise exception 'Invalid subcategory'; end if;
 if public_fields ? 'era' and public_fields->>'era' not in ('Contemporary','2000s','1990s','1980s','1970s','1960s','1950s','Pre-1950','Unknown') then raise exception 'Invalid era'; end if;
 if public_fields ? 'condition' and public_fields->>'condition' not in ('New / Unused','Like New','Excellent','Very Good','Good','Fair / Collector Condition') then raise exception 'Invalid condition'; end if;
 if public_fields ? 'authentication_status' and public_fields->>'authentication_status' not in ('Not authenticated','Needs Specialist Review','Authenticated') then raise exception 'Invalid authentication status'; end if;
 if public_fields->>'authentication_status'='Authenticated' or coalesce((p_data->'checks'->>'compliance_reviewed')::boolean,false) or coalesce((p_data->'checks'->>'specialist_reviewed')::boolean,false) then
 if not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Owner/Admin review required'; end if; end if;
 if coalesce((h.staff_data->>'specialist_review_required')::boolean,false) or p_data->>'inspection_stage'='Needs Specialist Review' then staff_fields:=staff_fields||'{"specialist_review_required":true}'::jsonb; end if;
 for k,v in select * from jsonb_each(coalesce(p_data->'checks','{}')) loop if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid inspection check'; end if; end loop;
 photo_list:=coalesce(p_photos,h.photos,'[]');
 if jsonb_typeof(photo_list)<>'array' or jsonb_array_length(photo_list)>8 then raise exception 'Invalid photos'; end if;
 for v in select * from jsonb_array_elements(photo_list) loop
 if jsonb_typeof(v)<>'object' or v - 'url' - 'role' <> '{}'::jsonb then raise exception 'Invalid photo fields'; end if;
 if v->>'url' is null or not coalesce(v->>'url'=any(i.photo_urls),false) or coalesce(v->>'role','') not in ('hero','front','back','side','bottom','maker mark','label','detail','defect','scale') then raise exception 'Use an uploaded item photo and valid role'; end if;
 end loop;
 select coalesce(array_agg(p->>'url' order by case p->>'role' when 'hero' then 0 when 'front' then 1 when 'back' then 1 when 'side' then 1 when 'bottom' then 1 when 'defect' then 3 else 2 end,ordinality),'{}') into urls from jsonb_array_elements(photo_list) with ordinality as a(p,ordinality);
 -- Changing an inspected listing takes it off sale until reviewed and republished.
 if i.status='listed' then update public.items set status='inspection',updated_at=now() where id=p_item; end if;
 insert into public.home_item_details(item_id,public_data,staff_data,checks,photos,inspection_stage,compliance_flags,defects,rejection_reason)
 values(p_item,public_fields,staff_fields,coalesce(p_data->'checks','{}'),photo_list,coalesce(p_data->>'inspection_stage','Received'),array(select jsonb_array_elements_text(coalesce(p_data->'compliance_flags','[]'))),array(select jsonb_array_elements_text(coalesce(p_data->'defects','[]'))),nullif(p_data->>'rejection_reason',''))
 on conflict(item_id) do update set public_data=excluded.public_data,staff_data=excluded.staff_data,checks=excluded.checks,photos=excluded.photos,inspection_stage=excluded.inspection_stage,compliance_flags=excluded.compliance_flags,defects=excluded.defects,rejection_reason=excluded.rejection_reason,updated_at=now();
 update public.items set material=public_fields->>'material',color=public_fields->>'primary_colour',pattern=public_fields->>'style',item_condition=public_fields->>'condition',condition_notes=public_fields->>'condition_notes',photo_urls=urls,inspected_at=case when coalesce((p_data->'checks'->>'inspection_complete')::boolean,false) then now() else null end where id=p_item;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value) values(auth.uid(),'home.inspection.saved','item',p_item::text,jsonb_build_object('stage',p_data->>'inspection_stage'));
end $$;
revoke all on function public.admin_save_home_item(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.admin_save_home_item(uuid,jsonb,jsonb) to authenticated;

create function private.home_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare missing text[];
begin
 if new.category='home_decor' and new.status='listed' then
 missing:=private.home_missing(new.id);
 if new.seller_pricing_approved_at is null or new.inspected_at is null then raise exception 'Inspection and seller approval required'; end if;
 if new.photo_urls is distinct from old.photo_urls then raise exception 'Unpublish Home item before changing photos'; end if;
 if cardinality(missing)>0 then raise exception 'Home listing incomplete: %',array_to_string(missing,', '); end if;
 end if;
 return new;
end $$;
revoke all on function private.home_item_guard() from public,anon,authenticated;
create trigger home_publish_guard before insert or update on public.items for each row execute function private.home_item_guard();
create function private.home_initialize() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.category='home_decor' then insert into public.home_item_details(item_id) values(new.id) on conflict do nothing; end if; return new; end $$;
revoke all on function private.home_initialize() from public,anon,authenticated;
create trigger home_initialize after insert or update of category on public.items for each row execute function private.home_initialize();

-- Patch the current vetted functions in place, preserving the existing authorization and commission logic.
do $$ declare def text; minimum_line text := 'minimum_value := (public.get_selling_rules() ->> ''minimumIndividualItemValueCents'')::integer;'; begin
 select pg_get_functiondef('public.admin_create_item_v2(uuid,uuid,text,text,text,text,text,integer,text,text)'::regprocedure) into def;
 def:=replace(def,'minimum_value := (public.get_selling_rules()->>''minimumIndividualItemValueCents'')::integer;',minimum_line);
 if position('''women'',''men'',''kids'',''electronics'',''shoes'',''accessories''' in def)=0 or position(minimum_line in def)=0 then raise exception 'Unexpected intake function; review before migrating'; end if;
 def:=replace(def,'''women'',''men'',''kids'',''electronics'',''shoes'',''accessories''','''women'',''men'',''kids'',''electronics'',''shoes'',''accessories'',''home_decor''');
 def:=replace(def,minimum_line,minimum_line || ' if item_category = ''home_decor'' then select coalesce(minimum_value_cents,minimum_value) into minimum_value from public.home_acceptance_rules where category=''home_decor''; end if;');
 execute def;
 select pg_get_functiondef('public.admin_review_item(uuid,integer,text,text)'::regprocedure) into def;
 def:=replace(def,'minimum_value := (public.get_selling_rules()->>''minimumIndividualItemValueCents'')::integer;',minimum_line);
 if position(minimum_line in def)=0 then raise exception 'Unexpected review function'; end if;
 execute replace(def,minimum_line,minimum_line || ' if current_item.category = ''home_decor'' then select coalesce(minimum_value_cents,minimum_value) into minimum_value from public.home_acceptance_rules where category=''home_decor''; end if;');
end $$;

-- Bundle eligibility is enforced regardless of which intake/review RPC is used.
create function private.home_bundle_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.category='home_decor' and new.status in ('bundle_candidate','bundled') and not (select bundle_eligible from public.home_acceptance_rules where category='home_decor') then raise exception 'Home bundles are not currently eligible'; end if;
 return new;
end $$;
revoke all on function private.home_bundle_guard() from public,anon,authenticated;
create trigger home_bundle_guard before insert or update on public.items for each row execute function private.home_bundle_guard();

alter table public.home_item_details add constraint home_flags_valid check(compliance_flags <@ array['animal-derived material concern','cultural property concern','weapon-like object','hazardous material','restricted export concern','authenticity concern']::text[]);
alter table public.home_item_details add constraint home_defects_valid check(defects <@ array['scratches','chips','cracks','stains','fading','tarnish','oxidation','paint loss','missing pieces','repairs','restoration','surface wear','electrical condition','other defect']::text[]);
alter table public.home_item_details add constraint home_rejection_valid check(rejection_reason is null or rejection_reason in ('too low resale value','excessive damage','unsafe item','difficult or uneconomical shipping','counterfeit / authenticity concern','prohibited material','excessive size or weight','incomplete item','hygiene issue','unable to verify sufficient information'));
