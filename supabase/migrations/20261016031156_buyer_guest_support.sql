-- Account-independent contact route. No fabricated business contact details.
create table public.buyer_guest_inquiries (
 id uuid primary key default gen_random_uuid(),email text not null check(length(email) between 5 and 254),
 message text not null check(length(message) between 10 and 3000),status text not null default 'open' check(status in ('open','reviewed','closed')),
 created_at timestamptz not null default now()
);
alter table public.buyer_guest_inquiries enable row level security;
revoke all on public.buyer_guest_inquiries from public,anon,authenticated;
grant insert on public.buyer_guest_inquiries to service_role;
create function public.admin_guest_inquiries() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2' or not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Owner/Admin with MFA required';end if;
 return coalesce((select jsonb_agg(x) from (select id,email,message,status,created_at from public.buyer_guest_inquiries order by created_at desc limit 100) x),'[]'::jsonb);
end $$;
revoke all on function public.admin_guest_inquiries() from public,anon;
grant execute on function public.admin_guest_inquiries() to authenticated;
create function public.admin_review_guest_inquiry(p_inquiry uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2' or not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Owner/Admin with MFA required';end if;
 if p_status not in ('reviewed','closed') or p_status is null then raise exception 'Invalid review status';end if;
 update public.buyer_guest_inquiries set status=p_status where id=p_inquiry;
 if not found then raise exception 'Inquiry unavailable';end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'guest_inquiry_reviewed','support',p_inquiry::text,jsonb_build_object('status',p_status),'Internal review status only; no message sent');
end $$;
revoke all on function public.admin_review_guest_inquiry(uuid,text) from public,anon;
grant execute on function public.admin_review_guest_inquiry(uuid,text) to authenticated;
