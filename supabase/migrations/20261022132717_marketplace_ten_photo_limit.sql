-- Keep existing assets and receipts; cap new direct uploads at ten. Managed limits stay unchanged.
create or replace function public.marketplace_begin_photo_upload(p_item uuid,p_version integer,p_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();i public.items%rowtype;begin
 if p_item is null or p_version is null or p_asset is null then raise exception 'Invalid upload request';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,7408));
 select * into i from public.items where id=p_item and owner_id=u and sale_mode='peer_to_peer' and status='listing_preparation' for update;
 if i.id is null or i.listing_version is distinct from p_version then raise exception 'Draft changed';end if;
 if exists(select 1 from public.inventory_reservations where item_id=i.id and status='active') or exists(select 1 from public.order_items where item_id=i.id) then raise exception 'Inventory is locked';end if;
 if (select count(*) from public.audit_logs where admin_user_id=u and action='marketplace.photo_upload_attempt' and created_at>now()-interval '1 hour')>=80 then raise exception 'Photo upload rate limit';end if;
 if (select count(*) from private.marketplace_photo_assets where item_id=i.id and withdrawn_at is null)>=10
 and not exists(select 1 from private.marketplace_photo_assets where id=p_asset and item_id=i.id and owner_id=u and withdrawn_at is null) then raise exception 'Maximum 10 photos per item';end if;
 -- An attempt is counted even when the same asset ID is retried, so retries cannot bypass the budget.
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(u,'marketplace.photo_upload_attempt','item',i.id::text,jsonb_build_object('asset',p_asset,'version',p_version),'Authenticated upload budget consumed before image decoding or provider storage');
end$$;
revoke all on function public.marketplace_begin_photo_upload(uuid,integer,uuid) from public,anon,service_role;
grant execute on function public.marketplace_begin_photo_upload(uuid,integer,uuid) to authenticated;

create or replace function public.register_marketplace_photo(p_item uuid,p_owner uuid,p_version integer,p_asset uuid,p_role text,p_defect text,p_provider text,p_key text,p_sha text,p_width integer,p_height integer,p_bytes integer)
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
 if (select count(*) from private.marketplace_photo_assets where item_id=i.id and withdrawn_at is null)>=10 then raise exception 'Maximum 10 photos per item';end if;
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


alter table public.clothing_listing_evidence drop constraint clothing_listing_evidence_photos_check;
alter table public.clothing_listing_evidence add constraint clothing_listing_evidence_photos_check check(
 jsonb_typeof(photos)='array' and ((evidence_source='team' and jsonb_array_length(photos) between 3 and 8)
 or (evidence_source='seller' and jsonb_array_length(photos) between 1 and 10))) not valid;
-- NOT VALID preserves historical evidence with more than ten photos; all new/updated evidence is checked.
