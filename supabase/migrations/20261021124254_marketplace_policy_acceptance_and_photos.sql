-- Remove fixed angles for direct sellers only; retain managed photo safeguards.
alter table public.clothing_listing_evidence drop constraint clothing_listing_evidence_photos_check;
alter table public.clothing_listing_evidence add constraint clothing_listing_evidence_photos_check check(jsonb_typeof(photos)='array' and ((evidence_source='team' and jsonb_array_length(photos) between 3 and 8) or (evidence_source='seller' and jsonb_array_length(photos) between 1 and 20)));
create or replace function public.submit_marketplace_evidence(p_item uuid,p_version integer,p_flaws text,p_no_label boolean,p_attest boolean)
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
 if roles is null or not roles && array['front','back','left','right'] then raise exception 'A clear actual-item photo required';end if;
 if p_no_label and roles @> array['size_label'] then raise exception 'Label declaration conflicts with label photo';end if;
 if not p_no_label and not roles @> array['size_label'] then raise exception 'Label photo required, or declare that no label exists';end if;
 if p_flaws='has_flaws' and (cardinality(defects)=0 or length(trim(coalesce(i.condition_notes,'')))<3) then raise exception 'Each defect needs a close-up and description';end if;
 if p_flaws='no_known_flaws' and (cardinality(defects)>0 or nullif(trim(i.condition_notes),'') is not null) then raise exception 'Resolve conflicting defect declarations';end if;
 insert into public.clothing_listing_evidence(item_id,photos,measurements,disclosed_defects,recorded_by,evidence_source,listing_version,disclosure_version,flaw_status,label_absent)
 values(i.id,photos,coalesce(i.marketplace_details->'measurements','{}'),defects,auth.uid(),'seller',i.listing_version,'seller-disclosure-v2',p_flaws,p_no_label)
 on conflict(item_id) do update set photos=excluded.photos,measurements=excluded.measurements,disclosed_defects=excluded.disclosed_defects,recorded_by=excluded.recorded_by,recorded_at=now(),evidence_source='seller',listing_version=excluded.listing_version,disclosure_version=excluded.disclosure_version,flaw_status=excluded.flaw_status,label_absent=excluded.label_absent;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(auth.uid(),'marketplace.disclosure_confirmed','item',i.id::text,jsonb_build_object('version',i.listing_version,'disclosureVersion','seller-disclosure-v2','noLabel',p_no_label,'flaws',p_flaws),'Seller confirmed actual-item photos and all known defects; not physical team inspection or payout approval');
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
 case when e.evidence_source='seller' and e.listing_version=i.listing_version and e.disclosure_version='seller-disclosure-v2' then 'documented' else 'incomplete' end as evidence_status,
 coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'role',a.role,'defect',a.defect,'url','/api/marketplace/photos/'||a.id::text) order by a.created_at,a.id) from private.marketplace_photo_assets a where a.item_id=i.id and a.withdrawn_at is null),'[]') as photo_assets
 from public.items i left join public.clothing_listing_evidence e on e.item_id=i.id
 where i.owner_id=auth.uid() and i.sale_mode='peer_to_peer' order by (i.status='listing_preparation') desc,i.updated_at desc,i.id limit 400
 )r),'[]');
end $$;
revoke all on function public.my_marketplace_drafts() from public,anon;
grant execute on function public.my_marketplace_drafts() to authenticated;
