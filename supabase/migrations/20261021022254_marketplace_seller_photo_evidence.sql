-- Seller photos are not team inspection. Existing managed evidence limits remain 3–8.
alter table public.clothing_listing_evidence
 add column evidence_source text not null default 'team' check(evidence_source in ('team','seller')),
 add column listing_version integer,
 add column disclosure_version text,
 add column label_absent boolean not null default false,
 add column flaw_status text check(flaw_status in ('no_known_flaws','has_flaws'));
alter table public.clothing_listing_evidence drop constraint clothing_listing_evidence_photos_check;
alter table public.clothing_listing_evidence add constraint clothing_listing_evidence_photos_check check(
 jsonb_typeof(photos)='array' and jsonb_array_length(photos) between 3 and case when evidence_source='team' then 8 else 20 end);

-- New responsibility: private provenance of server-decoded uploads, not another inventory.
create table private.marketplace_photo_assets(
 id uuid primary key, item_id uuid not null references public.items(id), owner_id uuid not null references auth.users(id),
 role text not null check(role in ('front','back','left','right','size_label','defect','detail')),
 defect text check(defect is null or length(trim(defect)) between 3 and 300),
 provider text not null check(provider in ('neon_staging','supabase')),
 storage_key text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 width integer not null check(width between 300 and 1800),height integer not null check(height between 300 and 1800),
 withdrawn_at timestamptz, byte_size integer not null check(byte_size between 1 and 1500000), created_at timestamptz not null default now(),
 check(role<>'defect' or defect is not null)
);
alter table private.marketplace_photo_assets enable row level security;
revoke all on private.marketplace_photo_assets from public,anon,authenticated;
create unique index marketplace_photo_assets_distinct_active_idx on private.marketplace_photo_assets(item_id,sha256) where withdrawn_at is null;
create index marketplace_photo_assets_item_idx on private.marketplace_photo_assets(item_id,created_at);

create function public.register_marketplace_photo(p_item uuid,p_owner uuid,p_version integer,p_asset uuid,p_role text,p_defect text,p_provider text,p_key text,p_sha text,p_width integer,p_height integer,p_bytes integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.items%rowtype; a private.marketplace_photo_assets%rowtype; prior_claims text:=current_setting('request.jwt.claims',true);
begin
 select * into i from public.items where id=p_item and owner_id=p_owner and sale_mode='peer_to_peer' for update;
 if not found or i.status<>'listing_preparation' then raise exception 'Editable direct draft required';end if;
 -- This function is service-only. The trusted server authenticates p_owner before upload.
 if auth.uid() is not null and auth.uid() is distinct from p_owner then raise exception 'Authenticated upload owner required';end if;
 select * into a from private.marketplace_photo_assets where id=p_asset;
 if found then
   if a.withdrawn_at is not null then raise exception 'Upload was withdrawn';end if;
   if (a.item_id,a.owner_id,a.sha256,a.role,a.defect) is distinct from (p_item,p_owner,p_sha,p_role,nullif(trim(p_defect),'')) then raise exception 'Upload request already used';end if;
   return jsonb_build_object('id',a.id,'version',i.listing_version);
 end if;
 if i.listing_version is distinct from p_version then raise exception 'Draft changed; refresh before uploading';end if;
 if exists(select 1 from public.inventory_reservations where item_id=i.id and status='active') or exists(select 1 from public.order_items where item_id=i.id) then raise exception 'Inventory is locked';end if;
 if (select count(*) from private.marketplace_photo_assets where item_id=i.id and withdrawn_at is null)>=20 then raise exception 'Maximum 20 photos per item';end if;
 if (select count(*) from private.marketplace_photo_assets where owner_id=p_owner and created_at>now()-interval '1 hour')>=80 then raise exception 'Hourly photo limit reached';end if;
 if p_key is distinct from p_owner::text||'/'||p_item::text||'/'||p_asset::text||'.webp' then raise exception 'Invalid object key';end if;
 insert into private.marketplace_photo_assets(id,item_id,owner_id,role,defect,provider,storage_key,sha256,width,height,byte_size)
 values(p_asset,p_item,p_owner,p_role,nullif(trim(p_defect),''),p_provider,p_key,p_sha,p_width,p_height,p_bytes);
 if auth.uid() is null then perform set_config('request.jwt.claims',jsonb_build_object('sub',p_owner,'role','authenticated','aal','aal1','is_anonymous',false)::text,true);end if;
 update public.items set photo_urls=array_append(coalesce(photo_urls,'{}'),'/api/marketplace/photos/'||p_asset::text),updated_at=now() where id=p_item returning * into i;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(p_owner,'marketplace.photo_registered','item',p_item::text,jsonb_build_object('asset',p_asset,'role',p_role,'version',i.listing_version),'Server decoded and stripped image metadata; seller supplied view/defect declaration');
 perform set_config('request.jwt.claims',coalesce(prior_claims,'{}'),true);
 return jsonb_build_object('id',p_asset,'version',i.listing_version);
end $$;
revoke all on function public.register_marketplace_photo(uuid,uuid,integer,uuid,text,text,text,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.register_marketplace_photo(uuid,uuid,integer,uuid,text,text,text,text,text,integer,integer,integer) to service_role;

create function public.my_marketplace_photo(p_asset uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('key',a.storage_key,'provider',a.provider,'item',a.item_id)
 from private.marketplace_photo_assets a where a.id=p_asset and a.owner_id=auth.uid() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
$$;
revoke all on function public.my_marketplace_photo(uuid) from public,anon;
grant execute on function public.my_marketplace_photo(uuid) to authenticated;

create function private.guard_clothing_evidence_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.evidence_source='team' and exists(select 1 from public.items where id=new.item_id and sale_mode='peer_to_peer') then raise exception 'Direct listings cannot claim team evidence';end if;
 if new.evidence_source='seller' and not exists(select 1 from public.items where id=new.item_id and sale_mode='peer_to_peer' and owner_id=auth.uid()) then raise exception 'Seller evidence requires direct item ownership';end if;
 return new;
end $$;
revoke all on function private.guard_clothing_evidence_source() from public,anon,authenticated;
create trigger clothing_evidence_source_guard before insert or update on public.clothing_listing_evidence for each row execute function private.guard_clothing_evidence_source();

create function public.submit_marketplace_evidence(p_item uuid,p_version integer,p_flaws text,p_no_label boolean,p_attest boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.items%rowtype; photos jsonb; defects text[]; roles text[];
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 select * into i from public.items where id=p_item and owner_id=auth.uid() and sale_mode='peer_to_peer' for update;
 if not found or i.status<>'listing_preparation' then raise exception 'Editable direct draft required';end if;
 if i.listing_version is distinct from p_version then raise exception 'Draft changed; refresh before confirming';end if;
 if exists(select 1 from public.inventory_reservations where item_id=i.id and status='active') or exists(select 1 from public.order_items where item_id=i.id) then raise exception 'Inventory is locked';end if;
 if p_attest is distinct from true or p_flaws is null or p_flaws not in ('no_known_flaws','has_flaws') or p_no_label is null then raise exception 'Confirm condition and complete disclosure';end if;
 if length(trim(coalesce(i.description,'')))<20 or nullif(trim(i.item_condition),'') is null then raise exception 'Describe the item and its condition first';end if;
 select array_agg(distinct role),coalesce(array_agg(distinct defect) filter(where role='defect'),'{}'),
 jsonb_agg(jsonb_strip_nulls(jsonb_build_object('url','/api/marketplace/photos/'||id::text,'role',role,'defect',defect)) order by created_at,id)
 into roles,defects,photos from private.marketplace_photo_assets where item_id=i.id and owner_id=auth.uid() and withdrawn_at is null;
 if roles is null or not roles @> array['front','back','left','right'] then raise exception 'Front, back, left and right photos required';end if;
 if p_no_label and roles @> array['size_label'] then raise exception 'Label declaration conflicts with label photo';end if;
 if not p_no_label and not roles @> array['size_label'] then raise exception 'Label photo required, or declare that no label exists';end if;
 if p_flaws='has_flaws' and (cardinality(defects)=0 or length(trim(coalesce(i.condition_notes,'')))<3) then raise exception 'Each defect needs a close-up and description';end if;
 if p_flaws='no_known_flaws' and (cardinality(defects)>0 or nullif(trim(i.condition_notes),'') is not null) then raise exception 'Resolve conflicting defect declarations';end if;
 insert into public.clothing_listing_evidence(item_id,photos,measurements,disclosed_defects,recorded_by,evidence_source,listing_version,disclosure_version,flaw_status,label_absent)
 values(i.id,photos,coalesce(i.marketplace_details->'measurements','{}'),defects,auth.uid(),'seller',i.listing_version,'seller-disclosure-v1',p_flaws,p_no_label)
 on conflict(item_id) do update set photos=excluded.photos,measurements=excluded.measurements,disclosed_defects=excluded.disclosed_defects,recorded_by=excluded.recorded_by,recorded_at=now(),evidence_source='seller',listing_version=excluded.listing_version,disclosure_version=excluded.disclosure_version,flaw_status=excluded.flaw_status,label_absent=excluded.label_absent;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(auth.uid(),'marketplace.disclosure_confirmed','item',i.id::text,jsonb_build_object('version',i.listing_version,'disclosureVersion','seller-disclosure-v1','noLabel',p_no_label,'flaws',p_flaws),'Seller confirmed actual-item photos and all known defects; not physical team inspection or payout approval');
 return jsonb_build_object('version',i.listing_version,'status','documented','purchasable',false);
end $$;
revoke all on function public.submit_marketplace_evidence(uuid,integer,text,boolean,boolean) from public,anon;
grant execute on function public.submit_marketplace_evidence(uuid,integer,text,boolean,boolean) to authenticated;

create or replace function public.my_marketplace_drafts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by (r.status='listing_preparation') desc,r.updated_at desc,r.id) from (
 select i.id,i.name,i.brand,i.category,i.subcategory,i.size,i.item_condition,i.color,i.material,i.description,i.condition_notes,i.listed_price_cents,i.marketplace_details,i.listing_version,i.status,i.marketplace_closure_reason,i.updated_at,
 case when e.evidence_source='seller' and e.listing_version=i.listing_version then 'documented' else 'incomplete' end as evidence_status,
 coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'role',a.role,'defect',a.defect,'url','/api/marketplace/photos/'||a.id::text) order by a.created_at,a.id) from private.marketplace_photo_assets a where a.item_id=i.id and a.withdrawn_at is null),'[]') as photo_assets
 from public.items i left join public.clothing_listing_evidence e on e.item_id=i.id
 where i.owner_id=auth.uid() and i.sale_mode='peer_to_peer' order by (i.status='listing_preparation') desc,i.updated_at desc,i.id limit 400
 )r),'[]');
end $$;
revoke all on function public.my_marketplace_drafts() from public,anon;
grant execute on function public.my_marketplace_drafts() to authenticated;

create function public.catalog_sale_provenance(p_items uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'sale_mode',i.sale_mode,'physical_custody',i.physical_custody,'shipping_responsibility',i.shipping_responsibility,
 'team_inspected',i.sale_mode='managed_consignment' and i.inspected_at is not null and exists(select 1 from public.audit_logs a where a.entity_type='item' and a.entity_id=i.id::text and a.action='item.physical_inspection_passed'))),'[]')
 from public.items i where cardinality(p_items) between 1 and 500 and i.id=any(p_items) and i.status in ('listed','reserved','sold') and i.first_published_at is not null and cardinality(i.photo_urls)>0;
$$;
revoke all on function public.catalog_sale_provenance(uuid[]) from public;
grant execute on function public.catalog_sale_provenance(uuid[]) to anon,authenticated;

create function public.withdraw_marketplace_photo(p_asset uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare i public.items%rowtype; a private.marketplace_photo_assets%rowtype;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 select * into a from private.marketplace_photo_assets where id=p_asset and owner_id=auth.uid();
 if not found then raise exception 'Photo unavailable';end if;
 select * into i from public.items where id=a.item_id and owner_id=auth.uid() and sale_mode='peer_to_peer' for update;
 if i.status<>'listing_preparation' or i.listing_version is distinct from p_version then raise exception 'Draft changed or locked';end if;
 if exists(select 1 from public.inventory_reservations where item_id=i.id and status='active') or exists(select 1 from public.order_items where item_id=i.id) then raise exception 'Inventory is locked';end if;
 if a.withdrawn_at is not null then return;end if;
 update private.marketplace_photo_assets set withdrawn_at=now() where id=p_asset;
 update public.items set photo_urls=array_remove(photo_urls,'/api/marketplace/photos/'||p_asset::text),updated_at=now() where id=i.id;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'marketplace.photo_withdrawn','item',i.id::text,jsonb_build_object('asset',p_asset),'Photo removed from draft; original private object retained for audit');
end $$;
revoke all on function public.withdraw_marketplace_photo(uuid,integer) from public,anon;
grant execute on function public.withdraw_marketplace_photo(uuid,integer) to authenticated;
