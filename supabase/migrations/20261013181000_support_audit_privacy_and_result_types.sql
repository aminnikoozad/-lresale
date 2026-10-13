-- Native Auth/PostgREST regression: customer handoff/message RPCs were blocked
-- by a legacy staff-only audit trigger. Authorization remains in table RLS and
-- the ownership/permission checks of each SECURITY DEFINER workflow RPC.
-- This trigger records authorized writes, including service-role AI updates.
begin;

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

commit;
