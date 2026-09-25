begin;

create or replace function public.admin_record_rejection_evidence(
  target_item_id uuid,
  seller_rejection_reason text,
  seller_rejection_photo_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;
  if seller_rejection_reason is null or char_length(btrim(seller_rejection_reason)) not between 3 and 500 then
    raise exception 'A seller-facing rejection reason is required';
  end if;
  if seller_rejection_photo_url is null or seller_rejection_photo_url !~ '^https://' or char_length(seller_rejection_photo_url) > 2000 then
    raise exception 'A valid rejection evidence photo is required';
  end if;

  select status into current_status from public.items where id = target_item_id for update;
  if not found then raise exception 'Item not found'; end if;
  if current_status <> 'rejected' then raise exception 'Rejection evidence can only be recorded for a rejected item'; end if;

  update public.items
  set seller_rejection_reason = btrim(seller_rejection_reason),
      seller_rejection_photo_url = btrim(seller_rejection_photo_url),
      updated_at = now()
  where id = target_item_id;

  insert into public.audit_logs(admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason)
  values(
    auth.uid(),
    'item.rejection_evidence_recorded',
    'item',
    target_item_id::text,
    null,
    jsonb_build_object('sellerReasonRecorded', true, 'evidencePhotoRecorded', true),
    'Seller-facing rejection transparency'
  );
end;
$$;

revoke all on function public.admin_record_rejection_evidence(uuid, text, text) from public, anon;
grant execute on function public.admin_record_rejection_evidence(uuid, text, text) to authenticated;

commit;
