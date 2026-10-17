-- Reconciled against main 1d54d473 and production catalog on 2026-10-17.

-- Adapted from PR40; all security changes commit atomically.

begin;

-- SECTION: 20261013180645_guard_return_submission_and_required_selling_rules.sql

-- Guard customer return submission and required selling-rule fields.
-- Native isolated API reproduction confirmed persisted unauthorized return status
-- and persisted versions with missing required numeric fields on 2026-10-13.
-- No existing return decision, price snapshot, commission lock or rule version is rewritten.

-- Customer submission cannot manufacture an administrative decision.
drop policy if exists return_requests_insert_own on public.return_requests;
create policy return_requests_insert_own
on public.return_requests
for insert to authenticated
with check (
  (select auth.uid()) = buyer_id
  and status = 'submitted'
  and exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = return_requests.order_item_id
      and oi.order_id = return_requests.order_id
      and o.id = return_requests.order_id
      and o.buyer_id = (select auth.uid())
      and o.status = 'delivered'
      and o.payment_status = 'paid'
  )
);

-- Preserve the prior permission, tier-continuity and versioning contract while
-- making every required numeric field fail closed for SQL NULL / absent JSON keys.
create or replace function public.update_selling_rules(
  new_rules jsonb,
  change_reason text,
  new_effective_at timestamptz default now()
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  previous_rules jsonb;
  next_version integer;
  minimum_value integer;
  pickup_value integer;
  tiers jsonb;
  tier_value jsonb;
  tier_rec record;
  previous_max integer := null;
  tier_index integer := 0;
begin
  if auth.uid() is null or not public.can_manage_selling_rules() then
    raise exception 'Owner or authorized Admin permission required';
  end if;
  if change_reason is null or char_length(trim(change_reason)) < 3
     or char_length(trim(change_reason)) > 500 then
    raise exception 'A valid change reason is required';
  end if;
  if new_effective_at is null then raise exception 'Effective time is required'; end if;
  if jsonb_typeof(new_rules) is distinct from 'object' then
    raise exception 'Selling rules must be a JSON object';
  end if;
  if jsonb_typeof(new_rules->'minimumIndividualItemValueCents') is distinct from 'number'
     or jsonb_typeof(new_rules->'minimumPickupEstimatedValueCents') is distinct from 'number' then
    raise exception 'Required minimum values must be numbers';
  end if;
  minimum_value := (new_rules->>'minimumIndividualItemValueCents')::integer;
  pickup_value := (new_rules->>'minimumPickupEstimatedValueCents')::integer;
  if minimum_value is null or minimum_value not between 1 and 100000000 then
    raise exception 'Invalid minimum item value';
  end if;
  if pickup_value is null or pickup_value not between 1 and 100000000 then
    raise exception 'Invalid minimum pickup value';
  end if;
  tiers := new_rules->'commissionTiers';
  if jsonb_typeof(tiers) is distinct from 'array' then
    raise exception 'At least one commission tier is required';
  end if;
  if jsonb_array_length(tiers) < 1 then raise exception 'At least one commission tier is required'; end if;

  for tier_value in select value from jsonb_array_elements(tiers) loop
    if jsonb_typeof(tier_value) is distinct from 'object'
       or jsonb_typeof(tier_value->'minCents') is distinct from 'number'
       or jsonb_typeof(tier_value->'sellerBps') is distinct from 'number'
       or jsonb_typeof(tier_value->'platformBps') is distinct from 'number'
       or (tier_value ? 'maxCents' and jsonb_typeof(tier_value->'maxCents') not in ('number','null')) then
      raise exception 'Required commission tier values must be numbers';
    end if;
  end loop;

  for tier_rec in
    select (tier->>'minCents')::integer min_cents,
      case when tier->'maxCents' is null or tier->'maxCents'='null'::jsonb
           then null else (tier->>'maxCents')::integer end max_cents,
      (tier->>'sellerBps')::integer seller_bps,
      (tier->>'platformBps')::integer platform_bps
    from jsonb_array_elements(tiers) tier
    order by (tier->>'minCents')::integer
  loop
    tier_index := tier_index + 1;
    if tier_rec.min_cents is null or tier_rec.seller_bps is null or tier_rec.platform_bps is null
       or tier_rec.min_cents < 0
       or tier_rec.seller_bps not between 0 and 10000
       or tier_rec.platform_bps not between 0 and 10000
       or tier_rec.seller_bps + tier_rec.platform_bps <> 10000 then
      raise exception 'Invalid commission tier';
    end if;
    if tier_rec.max_cents is not null and tier_rec.max_cents < tier_rec.min_cents then
      raise exception 'Invalid commission tier range';
    end if;
    if tier_index=1 and tier_rec.min_cents <> minimum_value then
      raise exception 'First commission tier must start at minimum item value';
    end if;
    if tier_index>1 and (previous_max is null or tier_rec.min_cents <> previous_max+1) then
      raise exception 'Commission tiers must be continuous with no gaps or overlaps';
    end if;
    previous_max := tier_rec.max_cents;
  end loop;
  if previous_max is not null then raise exception 'Final commission tier must be open ended'; end if;

  select value into previous_rules
  from public.business_setting_versions
  where setting_key='selling_rules' and effective_at<=now()
  order by effective_at desc,version desc limit 1;
  select coalesce(max(version),0)+1 into next_version
  from public.business_setting_versions where setting_key='selling_rules';
  insert into public.business_setting_versions(setting_key,version,value,effective_at,created_by,reason)
  values('selling_rules',next_version,new_rules,new_effective_at,auth.uid(),trim(change_reason));
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values(auth.uid(),'selling_rules.updated','business_settings','selling_rules',previous_rules,new_rules,trim(change_reason));
  return next_version;
end;
$$;


-- END SECTION

-- SECTION: 20261013181000_support_audit_privacy_and_result_types.sql

-- Native Auth/PostgREST regression: customer handoff/message RPCs were blocked
-- by a legacy staff-only audit trigger. Authorization remains in table RLS and
-- the ownership/permission checks of each SECURITY DEFINER workflow RPC.
-- This trigger records authorized writes, including service-role AI updates.

create or replace function private.audit_support_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  insert into public.support_audit_logs(actor_id,conversation_id,action,previous_value,new_value)
  values(auth.uid(),new.id,'conversation.updated',to_jsonb(old),to_jsonb(new));
  return new;
end;
$$;
revoke all on function private.audit_support_change() from public, anon, authenticated;

-- Disable must revoke stored AI capabilities as well as support UI access.
-- Preserve independently granted AI capabilities for staff without a support
-- membership, and preserve the existing configurable MFA policy unchanged.
create or replace function private.support_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and coalesce((
    select case
      when exists (
        select 1 from public.support_admins sa
        where sa.user_id=ar.user_id and not sa.active
      ) then false
      when ar.require_mfa and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then false
      when ar.role='owner' then true
      when p_permission='support.manage' then ar.can_support
      when p_permission='ai.view' then ar.can_ai_view
      when p_permission='ai.test' then ar.can_ai_test
      when p_permission='ai.suggest_training' then ar.can_ai_suggest_training
      when p_permission='ai.edit_training' then ar.can_ai_edit_training
      when p_permission='ai.approve_training' then ar.can_ai_approve_training
      when p_permission='ai.manage_behavior_rules' then ar.can_ai_manage_behavior_rules
      else false end
    from public.admin_roles ar where ar.user_id=auth.uid()
  ),false);
$$;

-- Genuine Supabase Auth uses varchar for users.email; PL/pgSQL RETURN QUERY
-- requires the declared text result type rather than an implicit varchar cast.
create or replace function public.support_admin_conversation(p_conversation_id uuid)
returns table(
  id uuid, customer_id uuid, customer_name text, customer_email text, customer_phone text, customer_code text, username text,
  subject text,status text,priority text,category text,subcategory text,assigned_to uuid,assigned_name text,
  human_requested boolean,ai_enabled boolean,internal_summary text,recommended_action text,ai_confidence numeric,
  pickup_id uuid,item_id uuid,external_order_ref text,created_at timestamptz,last_message_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  return query
  select c.id,c.customer_id,p.full_name,u.email::text,p.phone,p.customer_code,p.username,
         c.subject,c.status,c.priority,c.category,c.subcategory,c.assigned_to,sa.display_name,
         c.human_requested,c.ai_enabled,c.internal_summary,c.recommended_action,c.ai_confidence,
         c.pickup_id,c.item_id,c.external_order_ref,c.created_at,c.last_message_at
  from public.support_conversations c
  left join public.profiles p on p.id=c.customer_id
  left join auth.users u on u.id=c.customer_id
  left join public.support_admins sa on sa.user_id=c.assigned_to
  where c.id=p_conversation_id;
end;
$$;

-- The trainer Edge handler uses this context directly, so an explicit disabled
-- membership must also win over stale can_support / owner capability flags.
create or replace function public.support_admin_context()
returns table(
  user_id uuid, role text, display_name text, availability_status text,
  can_support boolean, ai_view boolean, ai_test boolean, ai_suggest_training boolean,
  ai_edit_training boolean, ai_approve_training boolean, ai_manage_behavior_rules boolean
)
language sql stable security definer set search_path = '' as $$
  select ar.user_id, ar.role, coalesce(sa.display_name,'Support Agent'), coalesce(sa.availability_status,'offline'),
    (ar.role='owner' or ar.can_support),
    (ar.role='owner' or ar.can_ai_view),
    (ar.role='owner' or ar.can_ai_test),
    (ar.role='owner' or ar.can_ai_suggest_training),
    (ar.role='owner' or ar.can_ai_edit_training),
    (ar.role='owner' or ar.can_ai_approve_training),
    (ar.role='owner' or ar.can_ai_manage_behavior_rules)
  from public.admin_roles ar
  left join public.support_admins sa on sa.user_id=ar.user_id and sa.active
  where ar.user_id=auth.uid()
    and (ar.role='owner' or ar.can_support)
    and (not ar.require_mfa or coalesce(auth.jwt()->>'aal','aal1')='aal2')
    and not exists(select 1 from public.support_admins disabled where disabled.user_id=ar.user_id and not disabled.active)
  limit 1;
$$;

-- The inbox shares the same Auth email/result-type boundary as thread detail.
create or replace function public.support_admin_inbox(
  p_filter text default 'all',
  p_query text default null,
  p_category text default null,
  p_limit integer default 100
)
returns table(
  id uuid, customer_id uuid, customer_name text, customer_email text, customer_phone text, customer_code text,
  subject text, status text, priority text, category text, subcategory text,
  assigned_to uuid, assigned_name text, human_requested boolean, ai_enabled boolean,
  last_message text, last_message_kind text, last_message_at timestamptz, waiting_seconds bigint
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  return query
  select c.id,c.customer_id,p.full_name,u.email::text,p.phone,p.customer_code,
         c.subject,c.status,c.priority,c.category,c.subcategory,
         c.assigned_to,sa.display_name,c.human_requested,c.ai_enabled,
         lm.body,lm.sender_kind,c.last_message_at,
         greatest(0,extract(epoch from (now()-coalesce(c.waiting_since,c.created_at)))::bigint)
  from public.support_conversations c
  left join public.profiles p on p.id=c.customer_id
  left join auth.users u on u.id=c.customer_id
  left join public.support_admins sa on sa.user_id=c.assigned_to
  left join lateral (
    select m.body,m.sender_kind from public.support_messages m where m.conversation_id=c.id order by m.created_at desc limit 1
  ) lm on true
  where
    (p_category is null or p_category='' or c.category=p_category)
    and (
      p_filter='all'
      or (p_filter='new' and c.status in ('ai','waiting') and c.assigned_to is null)
      or (p_filter='waiting' and c.status='waiting')
      or (p_filter='mine' and c.assigned_to=auth.uid())
      or (p_filter='ai' and c.status='ai')
      or (p_filter='urgent' and c.priority='urgent')
      or (p_filter='resolved' and c.status='resolved')
      or (p_filter='closed' and c.status='closed')
    )
    and (
      p_query is null or trim(p_query)=''
      or coalesce(p.full_name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(u.email,'') ilike '%'||trim(p_query)||'%'
      or coalesce(p.phone,'') ilike '%'||trim(p_query)||'%'
      or coalesce(p.customer_code,'') ilike '%'||trim(p_query)||'%'
      or c.id::text ilike '%'||trim(p_query)||'%'
      or coalesce(c.pickup_id::text,'') ilike '%'||trim(p_query)||'%'
      or coalesce(c.item_id::text,'') ilike '%'||trim(p_query)||'%'
      or coalesce(c.external_order_ref,'') ilike '%'||trim(p_query)||'%'
      or exists(select 1 from public.support_messages sm where sm.conversation_id=c.id and sm.body ilike '%'||trim(p_query)||'%')
    )
  order by
    case c.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
    case c.status when 'waiting' then 1 when 'human' then 2 when 'ai' then 3 when 'resolved' then 4 else 5 end,
    c.last_message_at desc
  limit least(greatest(coalesce(p_limit,100),1),250);
end; $$;


-- END SECTION

-- SECTION: 20261013181800_support_rpc_only_transitions.sql

-- Native role testing confirmed that raw authenticated conversation UPDATE
-- bypassed checked assignment/close RPCs. All checked-in customer/admin clients
-- use RPCs for edits; support-ai uses service_role. Keep those supported paths.

-- Remove both table-level and legacy column-level grants. Revoking only the
-- table grant leaves old UPDATE(status,priority,category,assigned_to) usable.
revoke update on public.support_conversations from authenticated;
revoke update(status,priority,category,assigned_to) on public.support_conversations from authenticated;

-- NULL means nobody owns this conversation. It must not bypass the existing
-- assigned-agent requirement; Owner/Admin retain their explicit override.
create or replace function public.support_return_to_ai(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_priority text; v_category text; v_assigned uuid; v_old_status text;
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  select priority,category,assigned_to,status into v_priority,v_category,v_assigned,v_old_status
  from public.support_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found'; end if;
  if v_assigned is distinct from auth.uid() and not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')) then
    raise exception 'Not assigned to you';
  end if;
  if v_priority in ('high','urgent') or v_category in ('Payment','Return') then
    raise exception 'Sensitive conversations must remain with human support';
  end if;
  update public.support_conversations
  set assigned_to=null,assigned_at=null,status='ai',ai_enabled=true,human_requested=false,waiting_since=null,updated_at=now()
  where id=p_conversation_id;
  insert into public.support_assignments(conversation_id,admin_id,assigned_by,action)
  values(p_conversation_id,null,auth.uid(),'returned_to_ai');
  insert into public.support_audit_logs(actor_id,conversation_id,action,previous_value,new_value)
  values(auth.uid(),p_conversation_id,'conversation.returned_to_ai',
    jsonb_build_object('assigned_to',v_assigned,'status',v_old_status),jsonb_build_object('assigned_to',null,'status','ai'));
end;
$$;


-- END SECTION

-- SECTION: 20261013182300_logistics_pickup_read_capability.sql

-- The real role constraint permits logistics, not pickup_logistics. Native API
-- testing proved explicitly pickup-authorized logistics staff could manage a
-- pickup but could not read it for the inbox/Realtime. Add only that demonstrated
-- role+capability combination; preserve existing intake readers and own reads.

alter policy collection_requests_select_authenticated
on public.collection_requests
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.admin_roles ar
    where ar.user_id = (select auth.uid())
      and (
        ar.role in ('owner','admin','operations_manager','warehouse')
        or (ar.role='logistics' and ar.can_manage_pickups)
      )
      and (not ar.require_mfa or coalesce((select auth.jwt())->>'aal','aal1')='aal2')
  )
);


-- END SECTION

commit;
