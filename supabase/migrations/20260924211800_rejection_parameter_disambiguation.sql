begin;

create or replace function public.admin_review_item_with_evidence(
  target_item_id uuid,
  proposed_price_cents integer,
  review_action text,
  action_reason text default null,
  seller_rejection_reason text default null,
  seller_rejection_photo_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;

  if review_action = 'reject' then
    if $5 is null or char_length(btrim($5)) < 3 then
      raise exception 'A seller-facing rejection reason is required';
    end if;
    if char_length(btrim($5)) > 500 then
      raise exception 'Seller-facing rejection reason is too long';
    end if;
    if $6 is null or $6 !~ '^https://' then
      raise exception 'A rejection evidence photo is required';
    end if;
    if char_length($6) > 2000 then
      raise exception 'Rejection evidence photo URL is too long';
    end if;
  end if;

  perform public.admin_review_item(target_item_id, proposed_price_cents, review_action, action_reason);

  if review_action = 'reject' then
    update public.items i
    set seller_rejection_reason = btrim($5),
        seller_rejection_photo_url = btrim($6),
        updated_at = now()
    where i.id = target_item_id;

    insert into public.audit_logs(admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason)
    values(
      auth.uid(), 'item.rejection_evidence_recorded', 'item', target_item_id::text,
      null, jsonb_build_object('sellerReasonRecorded', true, 'evidencePhotoRecorded', true),
      'Seller-facing rejection transparency'
    );
  end if;
end;
$$;

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
  if $2 is null or char_length(btrim($2)) not between 3 and 500 then
    raise exception 'A seller-facing rejection reason is required';
  end if;
  if $3 is null or $3 !~ '^https://' or char_length($3) > 2000 then
    raise exception 'A valid rejection evidence photo is required';
  end if;

  select i.status into current_status from public.items i where i.id = target_item_id for update;
  if not found then raise exception 'Item not found'; end if;
  if current_status <> 'rejected' then raise exception 'Rejection evidence can only be recorded for a rejected item'; end if;

  update public.items i
  set seller_rejection_reason = btrim($2),
      seller_rejection_photo_url = btrim($3),
      updated_at = now()
  where i.id = target_item_id;

  insert into public.audit_logs(admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason)
  values(
    auth.uid(), 'item.rejection_evidence_recorded', 'item', target_item_id::text,
    null, jsonb_build_object('sellerReasonRecorded', true, 'evidencePhotoRecorded', true),
    'Seller-facing rejection transparency'
  );
end;
$$;

revoke all on function public.admin_review_item_with_evidence(uuid, integer, text, text, text, text) from public, anon;
grant execute on function public.admin_review_item_with_evidence(uuid, integer, text, text, text, text) to authenticated;
revoke all on function public.admin_record_rejection_evidence(uuid, text, text) from public, anon;
grant execute on function public.admin_record_rejection_evidence(uuid, text, text) to authenticated;

commit;
