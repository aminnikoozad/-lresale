-- Private listing management only. No publication, provider or financial effects.
alter table public.items add column marketplace_closure_reason text
  check (marketplace_closure_reason in ('archived','sold_elsewhere'));
revoke update(marketplace_closure_reason) on public.items from authenticated;
create unique index audit_marketplace_draft_request_idx
 on public.audit_logs(admin_user_id,(new_value->>'requestId'))
 where action='marketplace.draft_action';

-- Runs after the foundation guard. State changes must also invalidate old forms.
create function private.guard_marketplace_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.sale_mode='managed_consignment' then
   if new.marketplace_closure_reason is not null then raise exception 'Managed inventory uses its existing workflow'; end if;
   return new;
 end if;
 if new.status<>'archived' and new.marketplace_closure_reason is not null then
   raise exception 'Closure reason requires archived inventory';
 end if;
 if tg_op='UPDATE' and (new.status,new.marketplace_closure_reason) is distinct from (old.status,old.marketplace_closure_reason) then
   new.listing_version:=old.listing_version+1;
 end if;
 return new;
end $$;
revoke all on function private.guard_marketplace_lifecycle() from public,anon,authenticated;
create trigger ab_items_marketplace_lifecycle before insert or update on public.items
for each row execute function private.guard_marketplace_lifecycle();

-- Reuse the inventory and audit ledger. Serializing on the seller also protects
-- the draft cap during restore/copy. Item row locking serializes checkout edits.
create function public.manage_marketplace_draft(p_item uuid,p_expected_version integer,p_action text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.items%rowtype; result jsonb; prior jsonb; prior_item text; prior_operation text;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
 if p_item is null or p_expected_version is null or p_expected_version<1 or p_request is null
    or p_action is null or p_action not in ('archive','restore','copy','sold_elsewhere') then raise exception 'Invalid listing action'; end if;
 perform 1 from auth.users where id=auth.uid() for update;
 select new_value,entity_id,new_value->>'operation' into prior,prior_item,prior_operation
 from public.audit_logs where admin_user_id=auth.uid() and action='marketplace.draft_action'
   and new_value->>'requestId'=p_request::text limit 1;
 if found then
   if prior_item is distinct from p_item::text or prior_operation is distinct from p_action then raise exception 'Request identifier already used'; end if;
   return prior->'result';
 end if;
 select * into i from public.items where id=p_item and owner_id=auth.uid() and sale_mode='peer_to_peer' for update;
 if not found then raise exception 'Draft unavailable'; end if;
 if i.listing_version<>p_expected_version then raise exception 'Draft changed; refresh before continuing'; end if;
 if i.status not in ('listing_preparation','archived') then raise exception 'Listing action unavailable'; end if;
 if exists(select 1 from public.inventory_reservations where item_id=i.id and status='active')
    or exists(select 1 from public.order_items where item_id=i.id) then raise exception 'Inventory with a reservation or order is locked'; end if;
 if p_action='copy' then
   -- Descriptive data only: no photos, inventory references, inspection, order,
   -- commission locks or evidence are copied into the distinct new inventory.
   result:=public.save_marketplace_draft(null,0,jsonb_build_object(
     'name',i.name,'category',i.category,'subcategory',i.subcategory,
     'brand_kind',coalesce(i.marketplace_details->>'brandKind','unknown'),'brand',i.brand,
     'size',i.size,'size_system',i.marketplace_details->>'sizeSystem',
     'item_condition',i.item_condition,'color',i.color,'material',i.material,
     'description',i.description,'condition_notes',i.condition_notes,'price_cents',i.listed_price_cents,
     'label_absent',coalesce((i.marketplace_details->>'labelAbsent')::boolean,false),
     'measurements',coalesce(i.marketplace_details->'measurements','{}'::jsonb)));
 elsif p_action='restore' then
   if i.status<>'archived' or i.marketplace_closure_reason='sold_elsewhere' then raise exception 'Only archived unsold drafts can be restored'; end if;
   if (select count(*) from public.items where owner_id=auth.uid() and sale_mode='peer_to_peer' and status<>'archived')>=200 then raise exception 'Draft limit reached'; end if;
   update public.items set status='listing_preparation',marketplace_closure_reason=null,updated_at=now() where id=i.id;
 else
   if i.status<>'listing_preparation' then raise exception 'Only an editable draft can be closed'; end if;
   update public.items set status='archived',marketplace_closure_reason=case p_action when 'archive' then 'archived' else 'sold_elsewhere' end,updated_at=now() where id=i.id;
 end if;
 if p_action<>'copy' then
   select jsonb_build_object('id',id,'version',listing_version,'status',status,'closureReason',marketplace_closure_reason)
     into result from public.items where id=i.id;
 end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
 values(auth.uid(),'marketplace.draft_action','item',i.id::text,
   jsonb_build_object('version',i.listing_version,'status',i.status,'closureReason',i.marketplace_closure_reason),
   jsonb_build_object('requestId',p_request,'operation',p_action,'result',result),
   case p_action when 'sold_elsewhere' then 'Seller declared an off-platform sale; no platform payment or sale recorded'
     when 'copy' then 'Seller copied descriptive fields into a new private draft'
     else 'Seller changed private draft availability' end);
 return result;
end $$;
revoke all on function public.manage_marketplace_draft(uuid,integer,text,uuid) from public,anon;
grant execute on function public.manage_marketplace_draft(uuid,integer,text,uuid) to authenticated;

-- Keep the original private projection, adding only the closure explanation.
create or replace function public.my_marketplace_drafts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by (r.status='listing_preparation') desc,r.updated_at desc,r.id) from (
   select id,name,brand,category,subcategory,size,item_condition,color,material,description,condition_notes,
     listed_price_cents,marketplace_details,listing_version,status,marketplace_closure_reason,updated_at
   from public.items where owner_id=auth.uid() and sale_mode='peer_to_peer' order by (status='listing_preparation') desc,updated_at desc,id limit 400
 )r),'[]'::jsonb);
end $$;
revoke all on function public.my_marketplace_drafts() from public,anon;
grant execute on function public.my_marketplace_drafts() to authenticated;
