-- Reuse the existing private, retried Resend transport and verified sender.
-- One job per customer message or guest inquiry; no staff/internal content.
alter table private.pickup_email_jobs
 add column support_message_id uuid unique references public.support_messages(id) on delete cascade,
 add column guest_inquiry_id uuid unique references public.buyer_guest_inquiries(id) on delete cascade,
 add constraint operations_email_single_source check (num_nonnulls(request_id,support_message_id,guest_inquiry_id)<=1);

create function private.queue_support_ticket_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.support_conversations; p public.profiles; customer_email text; details text; first_message boolean;
begin
 if new.sender_kind<>'customer' then return new;end if;
 select * into c from public.support_conversations where id=new.conversation_id;
 select * into p from public.profiles where id=c.customer_id;
 select email into customer_email from auth.users where id=c.customer_id;
 select count(*)=1 into first_message from public.support_messages where conversation_id=c.id and sender_kind='customer';
 details:=concat_ws(E'\n',
 'Support ticket / Demande de soutien',
 'Ticket: '||c.id::text,
 'Subject / Objet: '||c.subject,
 'Customer / Client: '||coalesce(nullif(p.full_name,''),p.username,'—'),
 'Email / Courriel: '||coalesce(customer_email,'—'),
 'Phone / Téléphone: '||coalesce(p.phone,'—'),
 'Sent / Envoyé: '||to_char(new.created_at at time zone 'America/Toronto','YYYY-MM-DD HH24:MI')||' Montréal',
 '',new.body,'',
 'Reply from the admin panel / Répondre depuis le panneau :',
 'https://shikimomo.com/admin/support',
 'Open the matching ticket reference. / Ouvrez la demande avec cette référence.');
 insert into private.pickup_email_jobs(support_message_id,payload)
 values(new.id,jsonb_build_object('from','Shikimomo <notifications@shikimomo.com>',
 'to',jsonb_build_array('shikimomo.customer@gmail.com'),
 'subject','Shikimomo · '||case when first_message then 'New support ticket / Nouvelle demande' else 'Customer reply / Réponse du client' end||' · '||c.id::text,
 'text',details)) on conflict(support_message_id) do nothing;
 return new;
end;$$;
revoke all on function private.queue_support_ticket_email() from public,anon,authenticated;
create trigger queue_support_ticket_email after insert on public.support_messages for each row execute function private.queue_support_ticket_email();

create function private.queue_guest_ticket_email()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.pickup_email_jobs(guest_inquiry_id,payload)
 values(new.id,jsonb_build_object('from','Shikimomo <notifications@shikimomo.com>',
 'to',jsonb_build_array('shikimomo.customer@gmail.com'),
 'subject','Shikimomo · Guest support ticket / Demande sans compte · '||new.id::text,
 'text',concat_ws(E'\n','Guest support ticket / Demande de soutien sans compte',
 'Ticket: '||new.id::text,'Reply email / Courriel de réponse: '||new.email,'',new.message,'',
 'Review / Consulter : https://shikimomo.com/admin/support/guest',
 'Reply to the customer email above. / Répondez à l’adresse courriel du client ci-dessus.')))
 on conflict(guest_inquiry_id) do nothing;
 return new;
end;$$;
revoke all on function private.queue_guest_ticket_email() from public,anon,authenticated;
create trigger queue_guest_ticket_email after insert on public.buyer_guest_inquiries for each row execute function private.queue_guest_ticket_email();

create function public.support_create_ticket(p_subject text,p_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare ticket_id uuid;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 if p_subject is null or length(trim(p_subject)) not between 3 and 160 or p_message is null or length(trim(p_message)) not between 10 and 4000 then raise exception 'Invalid ticket';end if;
 perform private.support_check_customer_rate('conversation');
 perform private.support_check_customer_rate('message');
 insert into public.support_conversations(customer_id,subject,status,priority,category,subcategory,ai_enabled,human_requested,waiting_since,first_human_requested_at,last_message_at,last_customer_message_at)
 values(auth.uid(),trim(p_subject),'waiting','normal','Other','Human Requested',false,true,now(),now(),now(),now()) returning id into ticket_id;
 insert into public.support_messages(conversation_id,sender_id,sender_kind,sender_display_name,body)
 values(ticket_id,auth.uid(),'customer','Customer',trim(p_message));
 insert into public.support_notifications(admin_id,event_type,conversation_id,title,body,priority)
 select sa.user_id,'human.requested',ticket_id,'New support ticket','A customer submitted a support ticket.','normal' from public.support_admins sa where sa.active;
 return ticket_id;
end;$$;
revoke all on function public.support_create_ticket(text,text) from public,anon;
grant execute on function public.support_create_ticket(text,text) to authenticated;

create function public.support_reply_ticket(p_conversation_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare old_status text; message_id uuid;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 select status into old_status from public.support_conversations where id=p_conversation_id and customer_id=auth.uid() for update;
 if not found or old_status='closed' then raise exception 'Ticket not available';end if;
 -- Route the reply to the team before insertion; do not generate an AI response.
 perform public.support_request_human(p_conversation_id);
 if old_status='resolved' then update public.support_conversations set resolved_at=null,reopened_at=now() where id=p_conversation_id;end if;
 message_id:=public.support_send_customer_message(p_conversation_id,p_body);
 return message_id;
end;$$;
revoke all on function public.support_reply_ticket(uuid,text) from public,anon;
grant execute on function public.support_reply_ticket(uuid,text) to authenticated;
