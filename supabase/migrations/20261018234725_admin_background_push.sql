create extension if not exists pg_net;
create table private.admin_push_devices (
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 endpoint text not null unique,
 p256dh text not null,
 auth_secret text not null,
 locale text not null default 'en' check (locale in ('en','fr')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table private.admin_push_devices enable row level security;
revoke all on private.admin_push_devices from public,anon,authenticated;
create index admin_push_devices_admin on private.admin_push_devices(admin_id) where active;

create table private.admin_push_jobs (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references private.admin_push_devices(id) on delete cascade,
 event_key text not null,
 event_type text not null,
 kind text not null check(kind in ('pickup','support','test')),
 target_path text not null check(target_path like '/admin%'),
 status text not null default 'pending' check(status in ('pending','sending','delivered','failed','skipped')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 claimed_at timestamptz,
 last_status integer,
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 unique(device_id,event_key)
);
alter table private.admin_push_jobs enable row level security;
revoke all on private.admin_push_jobs from public,anon,authenticated;
create index admin_push_jobs_ready on private.admin_push_jobs(next_attempt_at) where status in ('pending','sending');

create function private.admin_push_allowed(p_admin uuid,p_kind text,p_event text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from public.admin_roles ar
 left join public.admin_notification_preferences pref on pref.admin_id=ar.user_id
 where ar.user_id=p_admin
 and coalesce(pref.push_enabled,true)
 and coalesce((pref.event_preferences->>p_event)::boolean,true)
 and case p_kind
  when 'pickup' then ar.role='owner' or ar.can_manage_pickups
  when 'support' then (ar.role='owner' or ar.can_support)
    and not exists(select 1 from public.support_admins sa where sa.user_id=ar.user_id and not sa.active)
  when 'test' then true else false end
 );
$$;
revoke all on function private.admin_push_allowed(uuid,text,text) from public,anon,authenticated;

create function private.request_admin_push_dispatch()
returns void language plpgsql security definer set search_path='' as $$
declare token text;
begin
 delete from private.admin_push_jobs where created_at<now()-interval '7 days';
 if not exists(select 1 from private.admin_push_jobs where
    (status='pending' and next_attempt_at<=now()) or
    (status='sending' and claimed_at<now()-interval '2 minutes')) then return; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='shikimomo_admin_push_dispatch' limit 1;
 if token is null then return; end if;
 perform net.http_post(
  url:='https://shikimomo.com/api/admin/push/dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
  body:='{}'::jsonb,timeout_milliseconds:=30000);
exception when others then
 -- A delivery outage must never block a customer's pickup or support request.
 raise warning 'Admin push dispatch deferred';
end;
$$;
revoke all on function private.request_admin_push_dispatch() from public,anon,authenticated;

create function public.admin_register_push_device(p_endpoint text,p_p256dh text,p_auth text,p_locale text)
returns uuid language plpgsql security definer set search_path='' as $$
declare ar public.admin_roles%rowtype; sid uuid; device uuid;
begin
 select * into ar from public.admin_roles where user_id=auth.uid();
 if ar.user_id is null or (ar.require_mfa and coalesce(auth.jwt()->>'aal','aal1')<>'aal2') then
  raise exception 'Verified admin session required';
 end if;
 sid := (auth.jwt()->>'session_id')::uuid;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid() and (not_after is null or not_after>now())) then
  raise exception 'Active admin session required';
 end if;
 if length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|([a-zA-Z0-9-]+\.)*push.apple.com|([a-zA-Z0-9-]+\.)*notify.windows.com)/'
 or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
  raise exception 'Invalid push subscription';
 end if;
 insert into private.admin_push_devices(admin_id,session_id,endpoint,p256dh,auth_secret,locale)
 values(auth.uid(),sid,p_endpoint,p_p256dh,p_auth,case when p_locale='fr' then 'fr' else 'en' end)
 on conflict(endpoint) do update set admin_id=auth.uid(),session_id=sid,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,locale=excluded.locale,active=true,updated_at=now()
 returning id into device;
 return device;
end;
$$;
revoke all on function public.admin_register_push_device(text,text,text,text) from public,anon;
grant execute on function public.admin_register_push_device(text,text,text,text) to authenticated;

create function public.admin_push_device_status(p_endpoint text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.admin_push_devices d join public.admin_roles ar on ar.user_id=d.admin_id
 where d.admin_id=auth.uid() and d.endpoint=p_endpoint and d.active
 and d.session_id=(auth.jwt()->>'session_id')::uuid
 and (not ar.require_mfa or auth.jwt()->>'aal'='aal2'));
$$;
revoke all on function public.admin_push_device_status(text) from public,anon;
grant execute on function public.admin_push_device_status(text) to authenticated;

create function public.admin_disable_push_device(p_endpoint text)
returns void language sql security definer set search_path='' as $$
 update private.admin_push_devices set active=false,updated_at=now() where admin_id=auth.uid() and endpoint=p_endpoint;
$$;
revoke all on function public.admin_disable_push_device(text) from public,anon;
grant execute on function public.admin_disable_push_device(text) to authenticated;

create function public.admin_test_push_device(p_endpoint text)
returns void language plpgsql security definer set search_path='' as $$
declare d private.admin_push_devices%rowtype;
begin
 select * into d from private.admin_push_devices where endpoint=p_endpoint and admin_id=auth.uid() and active
 and session_id=(auth.jwt()->>'session_id')::uuid;
 if d.id is null or not public.admin_push_device_status(p_endpoint) then raise exception 'Registered admin device required'; end if;
 if exists(select 1 from private.admin_push_jobs where device_id=d.id and kind='test' and created_at>now()-interval '1 minute') then raise exception 'Wait one minute before another test'; end if;
 insert into private.admin_push_jobs(device_id,event_key,event_type,kind,target_path)
 values(d.id,'test:'||gen_random_uuid()::text,'push.test','test','/admin');
 perform private.request_admin_push_dispatch();
end;
$$;
revoke all on function public.admin_test_push_device(text) from public,anon;
grant execute on function public.admin_test_push_device(text) to authenticated;

create function private.queue_support_web_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.admin_push_jobs(device_id,event_key,event_type,kind,target_path)
 select d.id,'support:'||new.id::text,new.event_type,'support',
 case when new.conversation_id is not null then '/admin/support/'||new.conversation_id::text else '/admin/support' end
 from private.admin_push_devices d
 where d.admin_id=new.admin_id and d.active and private.admin_push_allowed(d.admin_id,'support',new.event_type)
 on conflict(device_id,event_key) do nothing;
 perform private.request_admin_push_dispatch();
 return new;
end;
$$;
revoke all on function private.queue_support_web_push() from public,anon,authenticated;
create trigger support_notifications_background_push after insert on public.support_notifications
for each row execute function private.queue_support_web_push();

create function private.queue_pickup_web_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.admin_push_jobs(device_id,event_key,event_type,kind,target_path)
 select d.id,'pickup:'||new.id::text,'pickup.created','pickup','/admin/operations#pickup-requests'
 from private.admin_push_devices d
 where d.active and private.admin_push_allowed(d.admin_id,'pickup','pickup.created')
 on conflict(device_id,event_key) do nothing;
 perform private.request_admin_push_dispatch();
 return new;
end;
$$;
revoke all on function private.queue_pickup_web_push() from public,anon,authenticated;
create trigger collection_requests_background_push after insert on public.collection_requests
for each row execute function private.queue_pickup_web_push();

create function public.claim_admin_push_jobs()
returns table(job_id uuid,endpoint text,p256dh text,auth_secret text,locale text,kind text,target_path text,event_key text)
language plpgsql security definer set search_path='' as $$
begin
 update private.admin_push_jobs j set status='skipped'
 where j.status in ('pending','sending') and
 (j.created_at<now()-interval '24 hours' or not exists(
 select 1 from private.admin_push_devices d join auth.sessions s on s.id=d.session_id
 where d.id=j.device_id and d.active and (s.not_after is null or s.not_after>now())
 and private.admin_push_allowed(d.admin_id,j.kind,j.event_type)));
 return query
 with ready as (
 select j.id from private.admin_push_jobs j
 where j.attempts<5 and ((j.status='pending' and j.next_attempt_at<=now()) or (j.status='sending' and j.claimed_at<now()-interval '2 minutes'))
 order by j.created_at limit 20 for update skip locked
 ), claimed as (
 update private.admin_push_jobs j set status='sending',attempts=j.attempts+1,claimed_at=now()
 from ready r where r.id=j.id returning j.*
 )
 select c.id,d.endpoint,d.p256dh,d.auth_secret,d.locale,c.kind,c.target_path,c.event_key
 from claimed c join private.admin_push_devices d on d.id=c.device_id;
end;
$$;
revoke all on function public.claim_admin_push_jobs() from public,anon,authenticated;
grant execute on function public.claim_admin_push_jobs() to service_role;

create function public.complete_admin_push_job(p_job uuid,p_success boolean,p_status integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status in (404,410) then
  update private.admin_push_devices set active=false,updated_at=now() where id=(select device_id from private.admin_push_jobs where id=p_job);
 end if;
 update private.admin_push_jobs set
 status=case when p_success then 'delivered' when p_status in (404,410) or attempts>=5 then 'failed' else 'pending' end,
 last_status=p_status,delivered_at=case when p_success then now() else null end,
 next_attempt_at=now()+make_interval(secs=>least(1800,60*power(2,attempts)::integer))
 where id=p_job and status='sending';
end;
$$;
revoke all on function public.complete_admin_push_job(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.complete_admin_push_job(uuid,boolean,integer) to service_role;

select cron.schedule('shikimomo-admin-push-retry','* * * * *','select private.request_admin_push_dispatch()');
