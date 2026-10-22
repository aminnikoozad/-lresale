-- Bound every attempted decode/storage call, including invalid files and retries.
-- Existing inventory/assets/audit remain authoritative; no financial policy changes.
create index marketplace_photos_owner_created on private.marketplace_photo_assets(owner_id,created_at);
create index audit_marketplace_photo_attempts on public.audit_logs(admin_user_id,created_at) where action='marketplace.photo_upload_attempt';
create function public.marketplace_begin_photo_upload(p_item uuid,p_version integer,p_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();i public.items%rowtype;begin
 if p_item is null or p_version is null or p_asset is null then raise exception 'Invalid upload request';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,7408));
 select * into i from public.items where id=p_item and owner_id=u and sale_mode='peer_to_peer' and status='listing_preparation' for update;
 if i.id is null or i.listing_version is distinct from p_version then raise exception 'Draft changed';end if;
 if exists(select 1 from public.inventory_reservations where item_id=i.id and status='active') or exists(select 1 from public.order_items where item_id=i.id) then raise exception 'Inventory is locked';end if;
 if (select count(*) from public.audit_logs where admin_user_id=u and action='marketplace.photo_upload_attempt' and created_at>now()-interval '1 hour')>=80 then raise exception 'Photo upload rate limit';end if;
 if (select count(*) from private.marketplace_photo_assets where item_id=i.id and withdrawn_at is null)>=20
 and not exists(select 1 from private.marketplace_photo_assets where id=p_asset and item_id=i.id and owner_id=u and withdrawn_at is null) then raise exception 'Maximum 20 photos per item';end if;
 -- An attempt is counted even when the same asset ID is retried, so retries cannot bypass the budget.
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
 values(u,'marketplace.photo_upload_attempt','item',i.id::text,jsonb_build_object('asset',p_asset,'version',p_version),'Authenticated upload budget consumed before image decoding or provider storage');
end$$;
revoke all on function public.marketplace_begin_photo_upload(uuid,integer,uuid) from public,anon,service_role;
grant execute on function public.marketplace_begin_photo_upload(uuid,integer,uuid) to authenticated;
