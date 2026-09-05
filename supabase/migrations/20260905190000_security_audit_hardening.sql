-- Production security/correctness hardening audit, 2026-09-05.
-- Keeps public storefront policy/catalog RPCs available while reducing privileged attack surface.

-- 1) Customer pickup RLS: validate that the selected slot belongs to the selected service area.
drop policy if exists collection_requests_insert_own on public.collection_requests;
create policy collection_requests_insert_own
on public.collection_requests
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'submitted'
  and hold_status = 'not_required'
  and confirmation_status = 'pending'
  and exists (
    select 1 from public.service_areas area
    where area.id = collection_requests.service_area_id and area.active
  )
  and exists (
    select 1 from public.pickup_slots slot
    where slot.id = collection_requests.pickup_slot_id
      and slot.service_area_id = collection_requests.service_area_id
      and slot.active
      and slot.window_start > now()
      and slot.booked_count < slot.capacity
  )
  and condition_confirmed
  and policy_accepted
  and pickup_policy_accepted
);

-- Combine customer/admin SELECT access into one policy and avoid per-row auth.uid() initialization.
drop policy if exists collection_requests_select_own on public.collection_requests;
drop policy if exists collection_requests_select_admin on public.collection_requests;
create policy collection_requests_select_authenticated
on public.collection_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.admin_roles ar
    where ar.user_id = (select auth.uid())
      and ar.role in ('owner','admin','operations_manager','warehouse','pickup_logistics')
      and (not ar.require_mfa or coalesce((select auth.jwt())->>'aal','aal1')='aal2')
  )
);

-- 2) Return cancelled pickup capacity to the scheduler exactly once.
create or replace function private.release_cancelled_pickup_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'cancelled' and new.status = 'cancelled' and new.pickup_slot_id is not null then
    update public.pickup_slots
    set booked_count = greatest(booked_count - 1, 0), updated_at = now()
    where id = new.pickup_slot_id;
  end if;
  return new;
end;
$$;

drop trigger if exists collection_requests_release_cancelled_slot on public.collection_requests;
create trigger collection_requests_release_cancelled_slot
after update of status on public.collection_requests
for each row execute function private.release_cancelled_pickup_slot();

-- 3) Self-service pickup actions are allowed only before the pickup has passed/been processed.
create or replace function public.confirm_own_pickup(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.collection_requests
  set confirmation_status='confirmed', pickup_confirmed_at=now(), updated_at=now()
  where id=p_request_id
    and user_id=auth.uid()
    and status in ('submitted','confirmed','scheduled')
    and confirmation_status <> 'cancelled'
    and (scheduled_window_end is null or scheduled_window_end > now());
  if not found then raise exception 'Pickup is no longer available to confirm'; end if;
end;
$$;

create or replace function public.cancel_own_pickup(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.collection_requests
  set status='cancelled', confirmation_status='cancelled', updated_at=now()
  where id=p_request_id
    and user_id=auth.uid()
    and status in ('submitted','confirmed','scheduled')
    and (scheduled_window_start is null or scheduled_window_start > now());
  if not found then raise exception 'Pickup is no longer available to cancel'; end if;
end;
$$;

-- 4) Missing admin status RPC used by Admin Pickup Inbox.
create or replace function public.admin_update_collection_request_status(p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_user_id uuid;
begin
  perform private.assert_admin_permission('pickups');
  if p_status not in ('submitted','confirmed','scheduled','collected','inspection','completed','cancelled','missed') then
    raise exception 'Invalid pickup status';
  end if;

  select status,user_id into v_old_status,v_user_id
  from public.collection_requests where id=p_request_id for update;
  if not found then raise exception 'Pickup request not found'; end if;

  if v_old_status in ('completed','cancelled') and p_status <> v_old_status then
    raise exception 'Finalized pickup status cannot be reopened from this control';
  end if;
  if v_old_status='collected' and p_status in ('submitted','confirmed','scheduled','cancelled') then
    raise exception 'Collected pickup cannot return to a pre-pickup status';
  end if;

  update public.collection_requests
  set status=p_status,
      confirmation_status=case when p_status='cancelled' then 'cancelled' else confirmation_status end,
      updated_at=now()
  where id=p_request_id;

  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values(auth.uid(),'pickup.status_changed','collection_request',p_request_id::text,
    jsonb_build_object('status',v_old_status),jsonb_build_object('status',p_status),'Admin pickup inbox status update');
end;
$$;

-- 5) Admin AI context must enforce the same AAL2 requirement as other privileged support paths.
create or replace function public.support_admin_context()
returns table(
  user_id uuid, role text, display_name text, availability_status text,
  can_ai_view boolean, can_ai_test boolean, can_ai_suggest_training boolean,
  can_ai_edit_training boolean, can_ai_approve_training boolean,
  can_ai_manage_behavior_rules boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select ar.user_id, ar.role, coalesce(sa.display_name,'Support Agent'), coalesce(sa.availability_status,'offline'),
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
  limit 1;
$$;

-- 6) Human request is idempotent and avoids notification spam.
create or replace function public.support_request_human(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_priority text;
  v_status text;
  v_human_requested boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select status,human_requested,priority into v_status,v_human_requested,v_priority
  from public.support_conversations
  where id=p_conversation_id and customer_id=auth.uid() for update;
  if not found or v_status='closed' then raise exception 'Conversation not available'; end if;

  update public.support_conversations
  set status=case when status='human' then 'human' else 'waiting' end,
      ai_enabled=false,
      human_requested=true,
      waiting_since=case when status='human' then waiting_since else coalesce(waiting_since,now()) end,
      first_human_requested_at=coalesce(first_human_requested_at,now()),
      subcategory=case when category='Other' then 'Human Requested' else subcategory end,
      updated_at=now()
  where id=p_conversation_id;

  if not v_human_requested and v_status not in ('waiting','human') then
    insert into public.support_notifications(admin_id,event_type,conversation_id,title,body,priority)
      select sa.user_id,'human.requested',p_conversation_id,'New support request','Customer requested a human support agent.',coalesce(v_priority,'normal')
      from public.support_admins sa where sa.active;
  end if;
end;
$$;

-- 7) Reopening a sensitive conversation stays with human support.
create or replace function public.support_send_customer_message(p_conversation_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message uuid;
  v_status text;
  v_priority text;
  v_category text;
  v_assigned uuid;
  v_sensitive boolean;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
  if length(trim(coalesce(p_body,''))) < 1 or length(trim(p_body)) > 4000 then raise exception 'Invalid message'; end if;
  perform private.support_check_customer_rate('message');

  select status,priority,category,assigned_to into v_status,v_priority,v_category,v_assigned
  from public.support_conversations
  where id=p_conversation_id and customer_id=auth.uid() for update;
  if not found then raise exception 'Conversation not available'; end if;
  if v_status='closed' then raise exception 'Conversation is closed'; end if;

  v_sensitive := v_priority in ('high','urgent') or v_category in ('Payment','Return');
  if v_status='resolved' then
    update public.support_conversations
    set status=case when v_sensitive then 'waiting' else 'ai' end,
        ai_enabled=not v_sensitive,
        human_requested=v_sensitive,
        waiting_since=case when v_sensitive then coalesce(waiting_since,now()) else null end,
        assigned_to=case when v_sensitive then assigned_to else null end,
        assigned_at=case when v_sensitive then assigned_at else null end,
        reopened_at=now(),resolved_at=null,updated_at=now()
    where id=p_conversation_id;

    insert into public.support_notifications(admin_id,event_type,conversation_id,title,body,priority)
      select sa.user_id,'conversation.reopened',p_conversation_id,'Conversation reopened',
        case when v_sensitive then 'A sensitive customer conversation was reopened and is waiting for human support.' else 'A customer replied to a resolved support conversation.' end,
        coalesce(v_priority,'normal')
      from public.support_admins sa
      where sa.active and (v_sensitive or sa.user_id=coalesce(v_assigned,sa.user_id));
  end if;

  insert into public.support_messages(conversation_id,sender_id,sender_kind,sender_display_name,body)
    values(p_conversation_id,auth.uid(),'customer','Customer',trim(p_body)) returning id into v_message;
  update public.support_conversations set last_message_at=now(),last_customer_message_at=now(),updated_at=now() where id=p_conversation_id;

  if v_status in ('human','waiting') and v_assigned is not null then
    insert into public.support_notifications(admin_id,event_type,conversation_id,title,body,priority)
    values(v_assigned,'customer.reply',p_conversation_id,'Customer replied',left(trim(p_body),180),coalesce(v_priority,'normal'));
  end if;
  return v_message;
end;
$$;

-- 8) Support agents may only resolve/close conversations assigned to them; Owner/Admin may manage any.
create or replace function public.support_resolve(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_assigned uuid; v_role text; v_old text;
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  select assigned_to,status into v_assigned,v_old from public.support_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found'; end if;
  select role into v_role from public.admin_roles where user_id=auth.uid();
  if v_role not in ('owner','admin') and v_assigned is distinct from auth.uid() then raise exception 'Take over the conversation before resolving it'; end if;
  update public.support_conversations set status='resolved',ai_enabled=false,resolved_at=now(),updated_at=now() where id=p_conversation_id;
  insert into public.support_audit_logs(actor_id,conversation_id,action,previous_value,new_value)
  values(auth.uid(),p_conversation_id,'conversation.resolved',jsonb_build_object('status',v_old),jsonb_build_object('status','resolved'));
end;
$$;

create or replace function public.support_close_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_assigned uuid; v_role text; v_old text;
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  select assigned_to,status into v_assigned,v_old from public.support_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found'; end if;
  select role into v_role from public.admin_roles where user_id=auth.uid();
  if v_role not in ('owner','admin') and v_assigned is distinct from auth.uid() then raise exception 'Take over the conversation before closing it'; end if;
  update public.support_conversations set status='closed',ai_enabled=false,closed_at=now(),updated_at=now() where id=p_conversation_id;
  insert into public.support_audit_logs(actor_id,conversation_id,action,previous_value,new_value)
  values(auth.uid(),p_conversation_id,'conversation.closed',jsonb_build_object('status',v_old),jsonb_build_object('status','closed'));
end;
$$;

-- 9) Assignment/takeover/return-to-AI actions are audited.
create or replace function public.support_take_over(p_conversation_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_current uuid; v_role text; v_old_status text;
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  select assigned_to,status into v_current,v_old_status from public.support_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found'; end if;
  select role into v_role from public.admin_roles where user_id=auth.uid();
  if v_current is not null and v_current<>auth.uid() and not (p_force and v_role in ('owner','admin')) then raise exception 'Conversation is assigned to another agent'; end if;
  update public.support_conversations set assigned_to=auth.uid(),assigned_at=now(),status='human',ai_enabled=false,updated_at=now() where id=p_conversation_id;
  insert into public.support_assignments(conversation_id,admin_id,assigned_by,action) values(p_conversation_id,auth.uid(),auth.uid(),case when v_current is null then 'assigned' else 'taken_over' end);
  insert into public.support_audit_logs(actor_id,conversation_id,action,previous_value,new_value)
  values(auth.uid(),p_conversation_id,'conversation.taken_over',jsonb_build_object('assigned_to',v_current,'status',v_old_status),jsonb_build_object('assigned_to',auth.uid(),'status','human'));
end;
$$;

create or replace function public.support_assign_conversation(p_conversation_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_old uuid; v_role text; v_old_status text;
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  select role into v_role from public.admin_roles where user_id=auth.uid();
  if v_role not in ('owner','admin') and auth.uid()<>p_admin_id then raise exception 'Only an admin can assign other agents'; end if;
  if not exists(select 1 from public.support_admins where user_id=p_admin_id and active) then raise exception 'Support agent not available'; end if;
  select assigned_to,status into v_old,v_old_status from public.support_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found'; end if;
  update public.support_conversations set assigned_to=p_admin_id,assigned_at=now(),status='human',ai_enabled=false,updated_at=now() where id=p_conversation_id;
  insert into public.support_assignments(conversation_id,admin_id,assigned_by,action) values(p_conversation_id,p_admin_id,auth.uid(),case when v_old is null then 'assigned' else 'taken_over' end);
  insert into public.support_notifications(admin_id,event_type,conversation_id,title,body,priority)
    select p_admin_id,'conversation.assigned',p_conversation_id,'Conversation assigned to you',coalesce(subject,'Support conversation'),priority from public.support_conversations where id=p_conversation_id;
  insert into public.support_audit_logs(actor_id,conversation_id,action,previous_value,new_value)
  values(auth.uid(),p_conversation_id,'conversation.assigned',jsonb_build_object('assigned_to',v_old,'status',v_old_status),jsonb_build_object('assigned_to',p_admin_id,'status','human'));
end;
$$;

create or replace function public.support_return_to_ai(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_priority text; v_category text; v_assigned uuid; v_old_status text;
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  select priority,category,assigned_to,status into v_priority,v_category,v_assigned,v_old_status from public.support_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found'; end if;
  if v_assigned<>auth.uid() and not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Not assigned to you'; end if;
  if v_priority in ('high','urgent') or v_category in ('Payment','Return') then raise exception 'Sensitive conversations must remain with human support'; end if;
  update public.support_conversations set assigned_to=null,assigned_at=null,status='ai',ai_enabled=true,human_requested=false,waiting_since=null,updated_at=now() where id=p_conversation_id;
  insert into public.support_assignments(conversation_id,admin_id,assigned_by,action) values(p_conversation_id,null,auth.uid(),'returned_to_ai');
  insert into public.support_audit_logs(actor_id,conversation_id,action,previous_value,new_value)
  values(auth.uid(),p_conversation_id,'conversation.returned_to_ai',jsonb_build_object('assigned_to',v_assigned,'status',v_old_status),jsonb_build_object('assigned_to',null,'status','ai'));
end;
$$;

-- 10) Correct Not Helpful feedback to point at the preceding customer question and avoid duplicate priority inflation.
create or replace function public.support_rate_ai_message(p_message_id uuid, p_helpful boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid;
  v_ai_created timestamptz;
  v_customer_message uuid;
  v_customer_question text;
  v_previous boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select m.conversation_id,m.created_at,m.customer_helpful into v_conv,v_ai_created,v_previous
  from public.support_messages m join public.support_conversations c on c.id=m.conversation_id
  where m.id=p_message_id and m.sender_kind='ai' and c.customer_id=auth.uid();
  if not found then raise exception 'Message not available'; end if;

  update public.support_messages set customer_helpful=p_helpful where id=p_message_id;
  insert into public.ai_feedback(conversation_id,message_id,customer_id,helpful)
  values(v_conv,p_message_id,auth.uid(),p_helpful)
  on conflict(message_id,customer_id) do update set helpful=excluded.helpful,created_at=now();

  if not p_helpful and v_previous is distinct from false then
    select id,body into v_customer_message,v_customer_question
    from public.support_messages
    where conversation_id=v_conv and sender_kind='customer' and created_at < v_ai_created
    order by created_at desc limit 1;
    if v_customer_message is not null then
      update public.unknown_questions
      set training_priority=training_priority+1,updated_at=now()
      where message_id=v_customer_message;
      if not found then
        insert into public.unknown_questions(conversation_id,message_id,customer_question,context_excerpt,confidence,training_priority)
        values(v_conv,v_customer_message,left(v_customer_question,4000),'AI answer was marked Not Helpful by the customer.',0,1);
      end if;
    end if;
  end if;
end;
$$;

-- 11) Global support business hours may only be changed by Owner/Admin.
create or replace function public.support_update_business_hour(p_day smallint, p_enabled boolean, p_opens time without time zone, p_closes time without time zone, p_timezone text default 'America/Toronto')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_role text;
begin
  if not private.is_support_admin() then raise exception 'Support access required'; end if;
  select role into v_role from public.admin_roles where user_id=auth.uid();
  if v_role not in ('owner','admin') then raise exception 'Owner or Admin permission required'; end if;
  if p_day<0 or p_day>6 then raise exception 'Invalid day'; end if;
  if p_enabled and (p_opens is null or p_closes is null or p_opens=p_closes) then raise exception 'Opening and closing times are required'; end if;
  if p_timezone not in ('America/Toronto','America/Montreal') then raise exception 'Unsupported timezone'; end if;
  insert into public.support_business_hours(day_of_week,enabled,opens_at,closes_at,timezone,updated_by,updated_at)
  values(p_day,p_enabled,case when p_enabled then p_opens else null end,case when p_enabled then p_closes else null end,p_timezone,auth.uid(),now())
  on conflict(day_of_week) do update set enabled=excluded.enabled,opens_at=excluded.opens_at,closes_at=excluded.closes_at,timezone=excluded.timezone,updated_by=auth.uid(),updated_at=now();
end;
$$;

-- 12) Atomic AI-turn claim prevents duplicate replies for the same customer message.
alter table public.support_conversations add column if not exists ai_last_processed_message_id uuid references public.support_messages(id) on delete set null;
create index if not exists support_conversations_ai_last_processed_idx on public.support_conversations(ai_last_processed_message_id) where ai_last_processed_message_id is not null;

create or replace function public.support_claim_ai_turn(p_conversation_id uuid, p_customer_id uuid, p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres','service_role') then raise exception 'Service role required'; end if;
  update public.support_conversations c
  set ai_last_processed_message_id=p_message_id,updated_at=now()
  where c.id=p_conversation_id
    and c.customer_id=p_customer_id
    and c.status='ai'
    and c.ai_enabled
    and c.ai_last_processed_message_id is distinct from p_message_id
    and exists(select 1 from public.support_messages m where m.id=p_message_id and m.conversation_id=c.id and m.sender_kind='customer' and m.sender_id=p_customer_id);
  return found;
end;
$$;
revoke all on function public.support_claim_ai_turn(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.support_claim_ai_turn(uuid,uuid,uuid) to service_role;

-- 13) Selling-rules validation is enforced in the database as well as the Admin UI.
create or replace function public.update_selling_rules(new_rules jsonb, change_reason text, new_effective_at timestamp with time zone default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_rules jsonb;
  next_version integer;
  minimum_value integer;
  pickup_value integer;
  tiers jsonb;
  tier_rec record;
  previous_max integer := null;
  tier_index integer := 0;
begin
  if auth.uid() is null or not public.can_manage_selling_rules() then raise exception 'Owner or authorized Admin permission required'; end if;
  if change_reason is null or char_length(trim(change_reason)) < 3 or char_length(trim(change_reason)) > 500 then raise exception 'A valid change reason is required'; end if;
  if new_effective_at is null then raise exception 'Effective time is required'; end if;
  if jsonb_typeof(new_rules) <> 'object' then raise exception 'Selling rules must be a JSON object'; end if;

  minimum_value := (new_rules ->> 'minimumIndividualItemValueCents')::integer;
  pickup_value := (new_rules ->> 'minimumPickupEstimatedValueCents')::integer;
  tiers := new_rules -> 'commissionTiers';
  if minimum_value < 1 or minimum_value > 100000000 then raise exception 'Invalid minimum item value'; end if;
  if pickup_value < 1 or pickup_value > 100000000 then raise exception 'Invalid minimum pickup value'; end if;
  if jsonb_typeof(tiers) <> 'array' or jsonb_array_length(tiers) < 1 then raise exception 'At least one commission tier is required'; end if;

  for tier_rec in
    select (tier->>'minCents')::integer min_cents,
           case when tier->'maxCents' is null or tier->'maxCents'='null'::jsonb then null else (tier->>'maxCents')::integer end max_cents,
           (tier->>'sellerBps')::integer seller_bps,
           (tier->>'platformBps')::integer platform_bps
    from jsonb_array_elements(tiers) tier
    order by (tier->>'minCents')::integer
  loop
    tier_index := tier_index + 1;
    if tier_rec.min_cents < 0 or tier_rec.seller_bps < 0 or tier_rec.platform_bps < 0 or tier_rec.seller_bps + tier_rec.platform_bps <> 10000 then raise exception 'Invalid commission tier'; end if;
    if tier_rec.max_cents is not null and tier_rec.max_cents < tier_rec.min_cents then raise exception 'Invalid commission tier range'; end if;
    if tier_index=1 and tier_rec.min_cents <> minimum_value then raise exception 'First commission tier must start at minimum item value'; end if;
    if tier_index>1 and (previous_max is null or tier_rec.min_cents <> previous_max + 1) then raise exception 'Commission tiers must be continuous with no gaps or overlaps'; end if;
    previous_max := tier_rec.max_cents;
  end loop;
  if previous_max is not null then raise exception 'Final commission tier must be open ended'; end if;

  select value into previous_rules from public.business_setting_versions
  where setting_key='selling_rules' and effective_at<=now() order by effective_at desc,version desc limit 1;
  select coalesce(max(version),0)+1 into next_version from public.business_setting_versions where setting_key='selling_rules';
  insert into public.business_setting_versions(setting_key,version,value,effective_at,created_by,reason)
  values('selling_rules',next_version,new_rules,new_effective_at,auth.uid(),trim(change_reason));
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values(auth.uid(),'selling_rules.updated','business_settings','selling_rules',previous_rules,new_rules,trim(change_reason));
  return next_version;
end;
$$;

-- 14) Reduce unauthenticated SECURITY DEFINER attack surface. Only truly public/pre-auth RPCs stay callable by anon.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname not in ('catalog_items','get_selling_rules','get_shipping_policy','is_username_available','check_admin_login_rate_limit','record_admin_login_failure','clear_admin_login_failures')
  loop
    execute format('revoke execute on function %s from anon', f.sig);
  end loop;
end $$;

-- Explicitly keep the small public/pre-auth whitelist callable.
grant execute on function public.catalog_items() to anon,authenticated;
grant execute on function public.get_selling_rules() to anon,authenticated;
grant execute on function public.get_shipping_policy() to anon,authenticated;
grant execute on function public.is_username_available(text) to anon,authenticated;
grant execute on function public.check_admin_login_rate_limit(text) to anon,authenticated;
grant execute on function public.record_admin_login_failure(text) to anon,authenticated;
grant execute on function public.clear_admin_login_failures(text) to anon,authenticated;

-- 15) Index foreign keys used by support/AI workflows as they scale.
create index if not exists ai_admin_conversations_admin_idx on public.ai_admin_conversations(admin_id);
create index if not exists ai_behavior_rules_approved_by_idx on public.ai_behavior_rules(approved_by);
create index if not exists ai_behavior_rules_created_by_idx on public.ai_behavior_rules(created_by);
create index if not exists ai_feedback_conversation_idx on public.ai_feedback(conversation_id);
create index if not exists ai_feedback_customer_idx on public.ai_feedback(customer_id);
create index if not exists ai_rule_versions_changed_by_idx on public.ai_rule_versions(changed_by);
create index if not exists ai_training_actions_admin_idx on public.ai_training_actions(admin_id);
create index if not exists ai_training_actions_draft_idx on public.ai_training_actions(draft_id);
create index if not exists ai_training_drafts_created_by_idx on public.ai_training_drafts(created_by);
create index if not exists ai_training_drafts_reviewed_by_idx on public.ai_training_drafts(reviewed_by);
create index if not exists knowledge_base_approved_by_idx on public.knowledge_base(approved_by);
create index if not exists knowledge_base_category_code_idx on public.knowledge_base(category_code);
create index if not exists knowledge_base_created_by_idx on public.knowledge_base(created_by);
create index if not exists knowledge_base_versions_changed_by_idx on public.knowledge_base_versions(changed_by);
create index if not exists support_assignments_admin_idx on public.support_assignments(admin_id);
create index if not exists support_assignments_assigned_by_idx on public.support_assignments(assigned_by);
create index if not exists support_business_hours_updated_by_idx on public.support_business_hours(updated_by);
create index if not exists support_conversation_tags_created_by_idx on public.support_conversation_tags(created_by);
create index if not exists support_conversation_tags_tag_idx on public.support_conversation_tags(tag_id);
create index if not exists support_notification_deliveries_notification_idx on public.support_notification_deliveries(notification_id);
create index if not exists support_notifications_conversation_idx on public.support_notifications(conversation_id);
create index if not exists support_presence_actor_idx on public.support_presence(actor_id);
create index if not exists unknown_questions_conversation_idx on public.unknown_questions(conversation_id);
create index if not exists unknown_questions_message_idx on public.unknown_questions(message_id);
create index if not exists unknown_questions_reviewed_by_idx on public.unknown_questions(reviewed_by);
