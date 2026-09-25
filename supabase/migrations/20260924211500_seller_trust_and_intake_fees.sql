begin;

-- Snapshot seller-facing intake fees on each new collection request.
-- Existing requests intentionally remain at $0 for the new fees so this policy
-- is not applied retroactively.
alter table public.collection_requests
  add column if not exists batch_code text,
  add column if not exists processing_fee_cents integer not null default 0,
  add column if not exists bag_fee_cents integer not null default 0;

alter table public.collection_requests
  drop constraint if exists collection_processing_fee_nonnegative,
  add constraint collection_processing_fee_nonnegative check (processing_fee_cents >= 0),
  drop constraint if exists collection_bag_fee_nonnegative,
  add constraint collection_bag_fee_nonnegative check (bag_fee_cents >= 0);

create sequence if not exists private.rewear_batch_code_seq start with 1000 increment by 1;

update public.collection_requests
set batch_code = 'RW-BATCH-' || lpad(nextval('private.rewear_batch_code_seq')::text, 8, '0')
where batch_code is null;

alter table public.collection_requests
  alter column batch_code set not null;

create unique index if not exists collection_requests_batch_code_uidx
  on public.collection_requests (batch_code);

create or replace function private.assign_collection_batch_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.batch_code is null or btrim(new.batch_code) = '' then
    new.batch_code := 'RW-BATCH-' || lpad(nextval('private.rewear_batch_code_seq')::text, 8, '0');
  end if;
  return new;
end;
$$;

revoke all on function private.assign_collection_batch_code() from public, anon, authenticated;

drop trigger if exists collection_requests_assign_batch_code on public.collection_requests;
create trigger collection_requests_assign_batch_code
before insert on public.collection_requests
for each row execute function private.assign_collection_batch_code();

create or replace function private.apply_collection_service_fees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb;
  pickup_rules jsonb;
  processing_fee integer;
  rewear_bag_fee integer;
begin
  rules := public.get_selling_rules();
  pickup_rules := coalesce(rules -> 'pickupRules', '{}'::jsonb);
  processing_fee := greatest(0, coalesce((pickup_rules ->> 'processingFeeCents')::integer, 1200));
  rewear_bag_fee := greatest(0, coalesce((pickup_rules ->> 'rewearBagFeeCents')::integer, 1200));

  new.processing_fee_cents := processing_fee;
  new.bag_fee_cents := case when new.request_type = 'bag' then rewear_bag_fee else 0 end;
  return new;
end;
$$;

revoke all on function private.apply_collection_service_fees() from public, anon, authenticated;

drop trigger if exists collection_requests_apply_service_fees on public.collection_requests;
create trigger collection_requests_apply_service_fees
before insert on public.collection_requests
for each row execute function private.apply_collection_service_fees();

-- Seller-safe rejection evidence is deliberately separate from internal notes.
alter table public.items
  add column if not exists seller_rejection_reason text,
  add column if not exists seller_rejection_photo_url text;

alter table public.items
  drop constraint if exists items_seller_rejection_reason_length,
  add constraint items_seller_rejection_reason_length check (
    seller_rejection_reason is null or char_length(seller_rejection_reason) between 3 and 500
  ),
  drop constraint if exists items_seller_rejection_photo_url_length,
  add constraint items_seller_rejection_photo_url_length check (
    seller_rejection_photo_url is null or char_length(seller_rejection_photo_url) between 8 and 2000
  );

create index if not exists items_collection_request_id_idx
  on public.items (collection_request_id)
  where collection_request_id is not null;

-- Publish the approved $12 processing fee and $12 REWEAR Bag fee as a new
-- versioned rule. Other selling rules remain unchanged.
with latest as (
  select value
  from public.business_setting_versions
  where setting_key = 'selling_rules'
    and effective_at <= now()
  order by effective_at desc, version desc
  limit 1
), next_version as (
  select coalesce(max(version), 0) + 1 as version
  from public.business_setting_versions
  where setting_key = 'selling_rules'
), proposed as (
  select
    coalesce(latest.value, '{}'::jsonb)
    || jsonb_build_object(
      'pickupRules',
      coalesce(latest.value -> 'pickupRules', '{}'::jsonb)
      || jsonb_build_object(
        'processingFeeCents', 1200,
        'rewearBagFeeCents', 1200
      )
    ) as value
  from latest
)
insert into public.business_setting_versions (
  setting_key,
  version,
  value,
  effective_at,
  created_by,
  reason
)
select
  'selling_rules',
  next_version.version,
  proposed.value,
  now(),
  null,
  'Approved seller intake fees: $12 processing per new batch and $12 for a REWEAR Bag; own bag/box has no Bag fee.'
from next_version, proposed;

-- A seller must actively confirm before a confirmed pickup can be dispatched,
-- collected, or recorded as a true no-show. A non-confirmed request can be
-- cancelled/rescheduled without being treated as a no-show.
create or replace function public.admin_update_collection_request_status(p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_confirmation_status text;
begin
  perform private.assert_admin_permission('pickups');
  if p_status not in ('submitted','confirmed','scheduled','collected','inspection','completed','cancelled','missed') then
    raise exception 'Invalid pickup status';
  end if;

  select status, confirmation_status
  into v_old_status, v_confirmation_status
  from public.collection_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Pickup request not found'; end if;
  if v_old_status in ('completed','cancelled') and p_status <> v_old_status then
    raise exception 'Finalized pickup status cannot be reopened from this control';
  end if;
  if v_old_status = 'collected' and p_status in ('submitted','confirmed','scheduled','cancelled') then
    raise exception 'Collected pickup cannot return to a pre-pickup status';
  end if;
  if p_status in ('scheduled','collected','missed') and v_confirmation_status <> 'confirmed' then
    raise exception 'Seller confirmation is required before dispatch, collection, or a no-show can be recorded';
  end if;

  update public.collection_requests
  set status = p_status,
      confirmation_status = case when p_status = 'cancelled' then 'cancelled' else confirmation_status end,
      updated_at = now()
  where id = p_request_id;

  insert into public.audit_logs(admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason)
  values(
    auth.uid(),
    'pickup.status_changed',
    'collection_request',
    p_request_id::text,
    jsonb_build_object('status', v_old_status, 'confirmationStatus', v_confirmation_status),
    jsonb_build_object('status', p_status, 'confirmationStatus', case when p_status='cancelled' then 'cancelled' else v_confirmation_status end),
    'Admin pickup inbox status update'
  );
end;
$$;

revoke all on function public.admin_update_collection_request_status(uuid, text) from public;
grant execute on function public.admin_update_collection_request_status(uuid, text) to authenticated;

-- Keep internal review notes private while storing a separate seller-facing
-- rejection reason and evidence photo.
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
    if seller_rejection_reason is null or char_length(btrim(seller_rejection_reason)) < 3 then
      raise exception 'A seller-facing rejection reason is required';
    end if;
    if char_length(btrim(seller_rejection_reason)) > 500 then
      raise exception 'Seller-facing rejection reason is too long';
    end if;
    if seller_rejection_photo_url is null or seller_rejection_photo_url !~ '^https://' then
      raise exception 'A rejection evidence photo is required';
    end if;
    if char_length(seller_rejection_photo_url) > 2000 then
      raise exception 'Rejection evidence photo URL is too long';
    end if;
  end if;

  perform public.admin_review_item(
    target_item_id,
    proposed_price_cents,
    review_action,
    action_reason
  );

  if review_action = 'reject' then
    update public.items
    set seller_rejection_reason = btrim(seller_rejection_reason),
        seller_rejection_photo_url = btrim(seller_rejection_photo_url),
        updated_at = now()
    where id = target_item_id;

    insert into public.audit_logs(
      admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason
    )
    values(
      auth.uid(),
      'item.rejection_evidence_recorded',
      'item',
      target_item_id::text,
      null,
      jsonb_build_object('sellerReasonRecorded', true, 'evidencePhotoRecorded', true),
      'Seller-facing rejection transparency'
    );
  end if;
end;
$$;

revoke all on function public.admin_review_item_with_evidence(uuid, integer, text, text, text, text) from public, anon;
grant execute on function public.admin_review_item_with_evidence(uuid, integer, text, text, text, text) to authenticated;

commit;
