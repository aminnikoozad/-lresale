-- Admin item acceptance, below-minimum handling, bundle creation and seller bundle approval.

create table if not exists public.item_status_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  constraint item_status_history_reason_length check (reason is null or char_length(reason) between 3 and 500)
);

create index if not exists item_status_history_item_idx
  on public.item_status_history (item_id, created_at desc);

create or replace function public.can_manage_items()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = auth.uid()
      and role in ('owner','admin','operations_manager','warehouse')
  );
$$;

revoke all on function public.can_manage_items() from public, anon;
grant execute on function public.can_manage_items() to authenticated;

create or replace function public.admin_customer_options()
returns table (
  user_id uuid,
  full_name text,
  username text,
  customer_code text,
  email text
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.full_name, p.username, p.customer_code, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.can_manage_items()
  order by coalesce(p.full_name, u.email), p.customer_code;
$$;

revoke all on function public.admin_customer_options() from public, anon;
grant execute on function public.admin_customer_options() to authenticated;

create or replace function public.admin_item_list()
returns table (
  item_id uuid,
  owner_id uuid,
  owner_name text,
  owner_username text,
  customer_code text,
  name text,
  brand text,
  category text,
  status text,
  initial_price_cents integer,
  seller_bps integer,
  platform_bps integer,
  seller_approved_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id,
    i.owner_id,
    p.full_name,
    p.username,
    p.customer_code,
    i.name,
    i.brand,
    i.category,
    i.status,
    i.initial_approved_price_cents,
    i.locked_seller_commission_bps,
    i.locked_platform_commission_bps,
    i.seller_pricing_approved_at,
    i.created_at
  from public.items i
  join public.profiles p on p.id = i.owner_id
  where public.can_manage_items()
  order by i.created_at desc
  limit 1000;
$$;

revoke all on function public.admin_item_list() from public, anon;
grant execute on function public.admin_item_list() to authenticated;

create or replace function public.admin_create_item(
  target_owner_id uuid,
  item_name text,
  item_brand text,
  item_category text,
  proposed_price_cents integer,
  below_minimum_action text default 'normal',
  action_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  minimum_value integer;
  created_item_id uuid;
  chosen_status text;
  action_label text;
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;
  if not exists (select 1 from auth.users where id = target_owner_id) then
    raise exception 'Customer does not exist';
  end if;
  if item_name is null or char_length(trim(item_name)) < 2 or char_length(trim(item_name)) > 160 then
    raise exception 'Invalid item name';
  end if;
  if item_brand is not null and char_length(trim(item_brand)) > 100 then
    raise exception 'Invalid brand';
  end if;
  if item_category not in ('women','men','kids','electronics','shoes','accessories') then
    raise exception 'Invalid category';
  end if;
  if proposed_price_cents is null or proposed_price_cents < 1 or proposed_price_cents > 100000000 then
    raise exception 'Invalid proposed price';
  end if;

  minimum_value := (public.get_selling_rules() ->> 'minimumIndividualItemValueCents')::integer;

  if proposed_price_cents >= minimum_value then
    if below_minimum_action not in ('normal','manual_review') then
      raise exception 'Below-minimum action is not applicable to this price';
    end if;
    chosen_status := case when below_minimum_action = 'manual_review' then 'manual_review' else 'accepted' end;
  else
    if below_minimum_action not in ('bundle_candidate','reject','manual_review','override') then
      raise exception 'Select Add to Bundle, Reject, Manual Review or Owner Override';
    end if;
    if below_minimum_action in ('reject','manual_review','override')
       and (action_reason is null or char_length(trim(action_reason)) < 3) then
      raise exception 'A reason is required';
    end if;
    if below_minimum_action = 'override' and not exists (
      select 1 from public.admin_roles
      where user_id = auth.uid() and role in ('owner','admin')
    ) then
      raise exception 'Owner or Admin is required for a below-minimum override';
    end if;
    chosen_status := case below_minimum_action
      when 'bundle_candidate' then 'bundle_candidate'
      when 'reject' then 'rejected'
      when 'manual_review' then 'manual_review'
      when 'override' then 'accepted'
    end;
  end if;

  insert into public.items (
    owner_id, name, brand, category, status, initial_approved_price_cents
  ) values (
    target_owner_id,
    trim(item_name),
    nullif(trim(coalesce(item_brand,'')),''),
    item_category,
    chosen_status,
    proposed_price_cents
  ) returning id into created_item_id;

  if proposed_price_cents < minimum_value and below_minimum_action = 'override' then
    insert into public.item_rule_overrides(item_id, override_type, reason, admin_user_id)
    values (created_item_id, 'below_minimum_value', trim(action_reason), auth.uid());
  end if;

  action_label := case
    when proposed_price_cents < minimum_value then below_minimum_action
    else chosen_status
  end;

  insert into public.item_status_history(item_id, old_status, new_status, changed_by, reason)
  values (created_item_id, null, chosen_status, auth.uid(), nullif(trim(coalesce(action_reason,'')),''));

  insert into public.audit_logs(admin_user_id, action, entity_type, entity_id, new_value, reason)
  values (
    auth.uid(),
    'item.created',
    'item',
    created_item_id::text,
    jsonb_build_object(
      'ownerId', target_owner_id,
      'name', trim(item_name),
      'category', item_category,
      'proposedPriceCents', proposed_price_cents,
      'status', chosen_status,
      'decision', action_label
    ),
    nullif(trim(coalesce(action_reason,'')),'')
  );

  return created_item_id;
end;
$$;

revoke all on function public.admin_create_item(uuid,text,text,text,integer,text,text) from public, anon;
grant execute on function public.admin_create_item(uuid,text,text,text,integer,text,text) to authenticated;

create or replace function public.admin_review_item(
  target_item_id uuid,
  proposed_price_cents integer,
  review_action text,
  action_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_item public.items%rowtype;
  minimum_value integer;
  new_status text;
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;

  select * into current_item from public.items where id = target_item_id for update;
  if not found then raise exception 'Item not found'; end if;
  if current_item.seller_pricing_approved_at is not null then
    raise exception 'Approved pricing is locked and cannot be reviewed this way';
  end if;
  if proposed_price_cents < 1 or proposed_price_cents > 100000000 then raise exception 'Invalid proposed price'; end if;

  minimum_value := (public.get_selling_rules() ->> 'minimumIndividualItemValueCents')::integer;

  if proposed_price_cents >= minimum_value and review_action = 'accept' then
    new_status := 'accepted';
  elsif review_action = 'bundle_candidate' then
    new_status := 'bundle_candidate';
  elsif review_action = 'reject' then
    new_status := 'rejected';
  elsif review_action = 'manual_review' then
    new_status := 'manual_review';
  elsif review_action = 'override' then
    if not exists (select 1 from public.admin_roles where user_id = auth.uid() and role in ('owner','admin')) then
      raise exception 'Owner or Admin is required for override';
    end if;
    if action_reason is null or char_length(trim(action_reason)) < 3 then raise exception 'Override reason required'; end if;
    new_status := 'accepted';
  else
    raise exception 'Selected action is not valid for the proposed price';
  end if;

  if proposed_price_cents < minimum_value and review_action = 'accept' then
    raise exception 'Item is below the current minimum; use bundle, reject, manual review or override';
  end if;
  if review_action in ('reject','manual_review','override') and (action_reason is null or char_length(trim(action_reason)) < 3) then
    raise exception 'A reason is required';
  end if;

  update public.items
  set initial_approved_price_cents = proposed_price_cents, status = new_status
  where id = target_item_id;

  if review_action = 'override' and proposed_price_cents < minimum_value then
    insert into public.item_rule_overrides(item_id, override_type, reason, admin_user_id)
    values (target_item_id, 'below_minimum_value', trim(action_reason), auth.uid());
  end if;

  insert into public.item_status_history(item_id, old_status, new_status, changed_by, reason)
  values (target_item_id, current_item.status, new_status, auth.uid(), nullif(trim(coalesce(action_reason,'')),''));

  insert into public.audit_logs(admin_user_id, action, entity_type, entity_id, previous_value, new_value, reason)
  values (
    auth.uid(), 'item.reviewed', 'item', target_item_id::text,
    jsonb_build_object('status', current_item.status, 'initialPriceCents', current_item.initial_approved_price_cents),
    jsonb_build_object('status', new_status, 'initialPriceCents', proposed_price_cents, 'decision', review_action),
    nullif(trim(coalesce(action_reason,'')),'')
  );
end;
$$;

revoke all on function public.admin_review_item(uuid,integer,text,text) from public, anon;
grant execute on function public.admin_review_item(uuid,integer,text,text) to authenticated;

create or replace function public.admin_create_bundle(
  target_owner_id uuid,
  bundle_title text,
  proposed_price_cents integer,
  target_item_ids uuid[],
  action_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  minimum_value integer;
  created_bundle_id uuid;
  expected_count integer;
  matched_count integer;
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;
  if bundle_title is null or char_length(trim(bundle_title)) < 2 or char_length(trim(bundle_title)) > 160 then
    raise exception 'Invalid bundle title';
  end if;
  expected_count := coalesce(array_length(target_item_ids, 1), 0);
  if expected_count < 2 then raise exception 'A bundle requires at least two items'; end if;

  minimum_value := (public.get_selling_rules() ->> 'minimumIndividualItemValueCents')::integer;
  if proposed_price_cents < minimum_value or proposed_price_cents > 100000000 then
    raise exception 'Bundle price must meet the current minimum listing value';
  end if;

  select count(*) into matched_count
  from public.items
  where id = any(target_item_ids)
    and owner_id = target_owner_id
    and status in ('bundle_candidate','manual_review')
    and seller_pricing_approved_at is null;

  if matched_count <> expected_count then
    raise exception 'All selected items must belong to the same seller and be eligible bundle candidates';
  end if;

  insert into public.bundles(owner_id,title,status,initial_approved_price_cents)
  values (target_owner_id, trim(bundle_title), 'waiting_for_seller_approval', proposed_price_cents)
  returning id into created_bundle_id;

  insert into public.bundle_items(bundle_id,item_id)
  select created_bundle_id, unnest(target_item_ids);

  update public.items set status = 'bundled' where id = any(target_item_ids);

  insert into public.item_status_history(item_id, old_status, new_status, changed_by, reason)
  select i.id, 'bundle_candidate', 'bundled', auth.uid(), nullif(trim(coalesce(action_reason,'')),'')
  from public.items i where i.id = any(target_item_ids);

  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
  values (
    auth.uid(), 'bundle.created', 'bundle', created_bundle_id::text,
    jsonb_build_object('ownerId',target_owner_id,'title',trim(bundle_title),'initialPriceCents',proposed_price_cents,'itemIds',to_jsonb(target_item_ids)),
    nullif(trim(coalesce(action_reason,'')),'')
  );

  return created_bundle_id;
end;
$$;

revoke all on function public.admin_create_bundle(uuid,text,integer,uuid[],text) from public, anon;
grant execute on function public.admin_create_bundle(uuid,text,integer,uuid[],text) to authenticated;

create or replace function public.approve_bundle_pricing(target_bundle_id uuid, expected_price integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.bundles
  set seller_pricing_approved_at = now(), status = 'approved'
  where id = target_bundle_id
    and owner_id = auth.uid()
    and initial_approved_price_cents = expected_price
    and status = 'waiting_for_seller_approval'
    and seller_pricing_approved_at is null;
  if not found then raise exception 'Bundle pricing changed or is unavailable; refresh and review'; end if;
end;
$$;

revoke all on function public.approve_bundle_pricing(uuid,integer) from public, anon;
grant execute on function public.approve_bundle_pricing(uuid,integer) to authenticated;

-- Allow seller item approval from both accepted and explicit waiting states.
drop policy if exists items_approve_own on public.items;
create policy items_approve_own on public.items for update to authenticated
using ((select auth.uid()) = owner_id and status in ('accepted','waiting_for_seller_approval') and seller_pricing_approved_at is null)
with check ((select auth.uid()) = owner_id and status in ('accepted','waiting_for_seller_approval'));

create or replace function public.approve_item_pricing(target_item_id uuid, expected_price integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.items set seller_pricing_approved_at = now()
  where id = target_item_id and owner_id = auth.uid()
    and initial_approved_price_cents = expected_price
    and status in ('accepted','waiting_for_seller_approval')
    and seller_pricing_approved_at is null;
  if not found then raise exception 'Pricing changed or item unavailable; refresh and review'; end if;
end;
$$;
revoke all on function public.approve_item_pricing(uuid,integer) from public, anon;
grant execute on function public.approve_item_pricing(uuid,integer) to authenticated;

-- Below-minimum admin overrides use the first tier, while normal items use their actual approved price.
create or replace function private.guard_item_commission() returns trigger
language plpgsql set search_path = '' as $$
declare
  configured_minimum integer;
  resolved_seller_bps integer;
  resolved_platform_bps integer;
  has_override boolean;
  tier_price integer;
begin
  if TG_OP = 'UPDATE' and old.seller_pricing_approved_at is not null then
    if (new.initial_approved_price_cents, new.locked_seller_commission_bps,
        new.locked_platform_commission_bps, new.seller_pricing_approved_at, new.owner_id)
      is distinct from
       (old.initial_approved_price_cents, old.locked_seller_commission_bps,
        old.locked_platform_commission_bps, old.seller_pricing_approved_at, old.owner_id) then
      raise exception 'Approved pricing and commission are permanently locked';
    end if;
  elsif new.seller_pricing_approved_at is not null then
    if auth.uid() is null or auth.uid() <> new.owner_id or new.status not in ('accepted','waiting_for_seller_approval')
       or new.initial_approved_price_cents is null then
      raise exception 'Only the seller may approve eligible item pricing';
    end if;

    configured_minimum := (public.get_selling_rules() ->> 'minimumIndividualItemValueCents')::integer;
    select exists(
      select 1 from public.item_rule_overrides o
      where o.item_id = new.id and o.override_type = 'below_minimum_value'
    ) into has_override;

    if new.initial_approved_price_cents < configured_minimum and not has_override then
      raise exception 'Item is below the current minimum individual listing value';
    end if;

    tier_price := case when has_override then greatest(new.initial_approved_price_cents, configured_minimum) else new.initial_approved_price_cents end;
    select seller_bps, platform_bps
      into resolved_seller_bps, resolved_platform_bps
      from private.current_commission_tier(tier_price);
    if resolved_seller_bps is null then raise exception 'No commission tier applies to this item'; end if;

    new.seller_pricing_approved_at := now();
    new.locked_seller_commission_bps := resolved_seller_bps;
    new.locked_platform_commission_bps := resolved_platform_bps;
    new.listed_price_cents := new.initial_approved_price_cents;
  else
    new.locked_seller_commission_bps := null;
    new.locked_platform_commission_bps := null;
  end if;

  if (new.status in ('listed','sold','auctioned') or new.sold_price_cents is not null)
     and new.seller_pricing_approved_at is null then
    raise exception 'Seller pricing approval is required before publishing or sale';
  end if;
  return new;
end;
$$;

alter table public.item_status_history enable row level security;
alter table public.item_status_history force row level security;
create policy item_status_history_owner_select on public.item_status_history for select to authenticated
using (exists (select 1 from public.items i where i.id = item_id and i.owner_id = (select auth.uid())));

revoke all on table public.item_status_history from anon, authenticated;
grant select on public.item_status_history to authenticated;

grant update (seller_pricing_approved_at,status) on public.bundles to authenticated;
create policy bundles_approve_own on public.bundles for update to authenticated
using ((select auth.uid()) = owner_id and status = 'waiting_for_seller_approval' and seller_pricing_approved_at is null)
with check ((select auth.uid()) = owner_id and status in ('waiting_for_seller_approval','approved'));
