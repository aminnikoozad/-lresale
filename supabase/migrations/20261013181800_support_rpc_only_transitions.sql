-- Native role testing confirmed that raw authenticated conversation UPDATE
-- bypassed checked assignment/close RPCs. All checked-in customer/admin clients
-- use RPCs for edits; support-ai uses service_role. Keep those supported paths.
begin;

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

commit;
