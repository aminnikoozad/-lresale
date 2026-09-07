-- Allow a customer to return a non-sensitive, unassigned waiting conversation to the AI safely.

create or replace function public.support_resume_ai(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text;
  v_priority text;
  v_category text;
  v_assigned uuid;
  v_message_id uuid;
  v_message_body text;
  v_reply text;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in required';
  end if;

  select status,priority,category,assigned_to
  into v_status,v_priority,v_category,v_assigned
  from public.support_conversations
  where id=p_conversation_id and customer_id=auth.uid()
  for update;

  if not found then raise exception 'Conversation not available'; end if;
  if v_status <> 'waiting' then raise exception 'Conversation is not waiting for support'; end if;
  if v_assigned is not null then raise exception 'A support agent is already assigned'; end if;
  if v_priority in ('high','urgent') or v_category in ('Payment','Return') then
    raise exception 'This conversation needs human support';
  end if;

  select id,body into v_message_id,v_message_body
  from public.support_messages
  where conversation_id=p_conversation_id and sender_kind='customer'
  order by created_at desc
  limit 1;

  update public.support_conversations
  set status='ai',
      ai_enabled=true,
      human_requested=false,
      waiting_since=null,
      subcategory=case when category='Other' and subcategory='Human Requested' then 'General Question' else subcategory end,
      updated_at=now()
  where id=p_conversation_id;

  if v_message_id is not null then
    v_reply := private.support_basic_reply(v_message_body);
    if v_reply is not null then
      insert into public.support_messages(conversation_id,sender_id,sender_kind,sender_display_name,body,ai_confidence,metadata)
      values(p_conversation_id,null,'ai','AI Assistant',v_reply,1,jsonb_build_object('provider','basic_safe_reply','recovered_from_waiting',true));

      update public.support_conversations
      set ai_last_processed_message_id=v_message_id,
          ai_confidence=1,
          last_message_at=now(),
          updated_at=now()
      where id=p_conversation_id;
    end if;
  end if;
end; $$;

revoke all on function public.support_resume_ai(uuid) from public,anon;
grant execute on function public.support_resume_ai(uuid) to authenticated;
