-- Save intake and filter attributes atomically using the existing permission-checked intake.
create or replace function public.admin_create_item_v5(
 target_owner_id uuid, target_collection_request_id uuid,
 item_name text, item_brand text, item_category text, item_subcategory text,
 item_size text, item_condition text, proposed_price_cents integer,
 below_minimum_action text, action_reason text,
 item_color text, item_material text, item_pattern text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_item uuid;
begin
 if auth.uid() is null or not public.can_manage_items() then
  raise exception 'Item management permission required';
 end if;
 if char_length(coalesce(item_color,'')) > 80 or char_length(coalesce(item_material,'')) > 100 or char_length(coalesce(item_pattern,'')) > 100 then
  raise exception 'Check clothing attributes';
 end if;
 created_item := public.admin_create_item_v4(target_owner_id,target_collection_request_id,item_name,item_brand,item_category,item_subcategory,item_size,item_condition,proposed_price_cents,below_minimum_action,action_reason);
 update public.items set color=nullif(trim(item_color),''),material=nullif(trim(item_material),''),pattern=nullif(trim(item_pattern),''),updated_at=now() where id=created_item;
 return created_item;
end;
$$;
revoke all on function public.admin_create_item_v5(uuid,uuid,text,text,text,text,text,text,integer,text,text,text,text,text) from public,anon;
grant execute on function public.admin_create_item_v5(uuid,uuid,text,text,text,text,text,text,integer,text,text,text,text,text) to authenticated;
