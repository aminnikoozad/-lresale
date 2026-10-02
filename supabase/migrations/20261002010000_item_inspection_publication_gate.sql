-- Record a staff attestation before a non-home item can reach the public catalog.
-- This records the human inspection; it cannot independently verify physical condition.
create function public.admin_attest_item_inspection(p_item uuid, p_checks jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare item_row public.items%rowtype;
begin
  if auth.uid() is null or not public.can_manage_items()
     or auth.jwt()->>'aal' is distinct from 'aal2'
  then raise exception 'Item staff with MFA required'; end if;
  if jsonb_typeof(p_checks) is distinct from 'object'
     or p_checks->>'clean' is distinct from 'true'
     or p_checks->>'intact' is distinct from 'true'
     or p_checks->>'suitable_for_resale' is distinct from 'true'
     or p_checks->>'no_significant_damage' is distinct from 'true'
  then raise exception 'Physical inspection checks must all pass'; end if;

  select * into item_row from public.items where id = p_item for update;
  if not found then raise exception 'Item unavailable'; end if;
  if item_row.category = 'home_decor' then raise exception 'Use the Home inspection workflow'; end if;
  if item_row.status in ('rejected','sold','returned','donated','archived')
  then raise exception 'Item cannot be inspected for listing'; end if;
  if item_row.category in ('women','men','kids','shoes','accessories')
     and p_checks->>'wearable_without_stains_tears_holes' is distinct from 'true'
  then raise exception 'Clothing and accessories must be wearable without stains, tears or holes'; end if;
  if item_row.inspected_at is not null then return; end if;

  update public.items set inspected_at = now(), updated_at = now() where id = p_item;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
  values(auth.uid(),'item.physical_inspection_passed','item',p_item::text,
    jsonb_build_object('checks',p_checks,'inspectedAt',now()),
    'Staff attested physical condition before publication');
end $$;
revoke all on function public.admin_attest_item_inspection(uuid,jsonb) from public,anon;
grant execute on function public.admin_attest_item_inspection(uuid,jsonb) to authenticated;

create function private.require_item_inspection_for_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.category <> 'home_decor' and new.status in ('listed','relisted')
     and new.inspected_at is null
  then raise exception 'Recorded physical inspection required before publication'; end if;
  return new;
end $$;
revoke all on function private.require_item_inspection_for_publication() from public,anon,authenticated;
create trigger items_require_inspection_for_publication
before insert or update of status,published_at on public.items
for each row execute function private.require_item_inspection_for_publication();
