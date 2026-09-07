-- Keep basic greetings conversational and make AI chat recovery clear after a human handoff.

create or replace function private.support_basic_reply(p_body text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare q text := lower(trim(coalesce(p_body,'')));
begin
  q := regexp_replace(q, '[[:punct:]]+', '', 'g');
  q := regexp_replace(q, '\s+', ' ', 'g');

  if q in ('hi','hello','hey','hiya','salam','salâm','bonjour','bonsoir','good morning','good afternoon','good evening') then
    return case
      when q in ('bonjour','bonsoir') then 'Bonjour! Je suis l’assistant Rewear. Je peux vous aider avec la vente, le ramassage, les commissions, l’état de vos articles, la livraison et votre compte. Comment puis-je vous aider?'
      else 'Hi! I’m the Rewear AI Assistant. I can help with selling, pickup, commission, item status, shipping and your account. What can I help you with?'
    end;
  end if;

  if q in ('i have problem','i have a problem','i need help','help','can you help me','j ai un probleme','jai un probleme','j ai besoin d aide','aide') then
    return case
      when q like '%probleme%' or q='aide' then 'Bien sûr. Dites-moi ce qui ne fonctionne pas ou ce que vous essayez de faire, et je vais vous guider. Si le problème nécessite une intervention humaine, je transmettrai la conversation au Support.'
      else 'Of course. Tell me what is not working or what you are trying to do, and I’ll guide you. If the issue needs a person, I’ll hand the conversation to Support.'
    end;
  end if;

  return null;
end; $$;

revoke all on function private.support_basic_reply(text) from public,anon,authenticated;

create or replace function public.support_start_conversation(p_message text, p_subject text default 'Support chat')
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_subject text;
  v_reply text;
  v_customer_message uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
  if length(trim(coalesce(p_message,''))) < 1 or length(trim(p_message)) > 4000 then raise exception 'Invalid message'; end if;

  perform private.support_check_customer_rate('conversation');
  perform private.support_check_customer_rate('message');
  v_subject := left(coalesce(nullif(trim(p_subject),''),'Support chat'),160);

  insert into public.support_conversations(customer_id,subject,status,priority,category,subcategory,ai_enabled,last_message_at,last_customer_message_at)
  values(auth.uid(),v_subject,'ai','normal','Other','General Question',true,now(),now())
  returning id into v_id;

  insert into public.support_messages(conversation_id,sender_id,sender_kind,sender_display_name,body)
  values(v_id,auth.uid(),'customer','Customer',trim(p_message))
  returning id into v_customer_message;

  v_reply := private.support_basic_reply(p_message);
  if v_reply is not null then
    insert into public.support_messages(conversation_id,sender_id,sender_kind,sender_display_name,body,ai_confidence,metadata)
    values(v_id,null,'ai','AI Assistant',v_reply,1,jsonb_build_object('provider','basic_safe_reply'));

    update public.support_conversations
    set ai_last_processed_message_id=v_customer_message,
        ai_confidence=1,
        last_message_at=now(),
        updated_at=now()
    where id=v_id;
  end if;

  return v_id;
end; $$;

create or replace function public.support_send_customer_message(p_conversation_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_message uuid;
  v_status text;
  v_priority text;
  v_category text;
  v_assigned uuid;
  v_sensitive boolean;
  v_reply text;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
  if length(trim(coalesce(p_body,'')))<1 or length(trim(p_body))>4000 then raise exception 'Invalid message'; end if;

  perform private.support_check_customer_rate('message');

  select status,priority,category,assigned_to
  into v_status,v_priority,v_category,v_assigned
  from public.support_conversations
  where id=p_conversation_id and customer_id=auth.uid()
  for update;

  if not found then raise exception 'Conversation not available'; end if;
  if v_status='closed' then raise exception 'Conversation is closed'; end if;

  v_sensitive:=v_priority in ('high','urgent') or v_category in ('Payment','Return');

  if v_status='resolved' then
    update public.support_conversations
    set status=case when v_sensitive then 'waiting' else 'ai' end,
        ai_enabled=not v_sensitive,
        human_requested=v_sensitive,
        waiting_since=case when v_sensitive then coalesce(waiting_since,now()) else null end,
        assigned_to=case when v_sensitive then assigned_to else null end,
        assigned_at=case when v_sensitive then assigned_at else null end,
        reopened_at=now(),
        resolved_at=null,
        updated_at=now()
    where id=p_conversation_id;

    insert into public.support_notifications(admin_id,event_type,conversation_id,title,body,priority)
    select sa.user_id,
           'conversation.reopened',
           p_conversation_id,
           'Conversation reopened',
           case when v_sensitive then 'A sensitive customer conversation was reopened and is waiting for human support.' else 'A customer replied to a resolved support conversation.' end,
           coalesce(v_priority,'normal')
    from public.support_admins sa
    where sa.active;

    v_status := case when v_sensitive then 'waiting' else 'ai' end;
  end if;

  insert into public.support_messages(conversation_id,sender_id,sender_kind,sender_display_name,body)
  values(p_conversation_id,auth.uid(),'customer','Customer',trim(p_body))
  returning id into v_message;

  update public.support_conversations
  set last_message_at=now(),last_customer_message_at=now(),updated_at=now()
  where id=p_conversation_id;

  if v_status='ai' then
    v_reply := private.support_basic_reply(p_body);
    if v_reply is not null then
      insert into public.support_messages(conversation_id,sender_id,sender_kind,sender_display_name,body,ai_confidence,metadata)
      values(p_conversation_id,null,'ai','AI Assistant',v_reply,1,jsonb_build_object('provider','basic_safe_reply'));

      update public.support_conversations
      set ai_last_processed_message_id=v_message,
          ai_confidence=1,
          last_message_at=now(),
          updated_at=now()
      where id=p_conversation_id;
    end if;
  end if;

  if v_status in ('human','waiting') and v_assigned is not null then
    insert into public.support_notifications(admin_id,event_type,conversation_id,title,body,priority)
    values(v_assigned,'customer.reply',p_conversation_id,'Customer replied',left(trim(p_body),180),coalesce(v_priority,'normal'));
  end if;

  return v_message;
end; $$;
