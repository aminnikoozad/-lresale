-- Secure reminder worker primitives and private Admin login throttling.

create table if not exists public.admin_login_rate_limits (
  rate_key text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.admin_login_rate_limits enable row level security;
revoke all on public.admin_login_rate_limits from anon, authenticated;

create or replace function public.check_admin_login_rate_limit(p_rate_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r public.admin_login_rate_limits%rowtype;
begin
  if length(p_rate_key) < 32 or length(p_rate_key) > 128 then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 900);
  end if;
  select * into r from public.admin_login_rate_limits where rate_key = p_rate_key;
  if not found then return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0); end if;
  if r.blocked_until is not null and r.blocked_until > now() then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', greatest(1, extract(epoch from (r.blocked_until-now()))::integer));
  end if;
  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end;
$$;

create or replace function public.record_admin_login_failure(p_rate_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.admin_login_rate_limits%rowtype;
begin
  if length(p_rate_key) < 32 or length(p_rate_key) > 128 then return; end if;
  select * into r from public.admin_login_rate_limits where rate_key = p_rate_key for update;
  if not found then
    insert into public.admin_login_rate_limits(rate_key, failures, window_started_at, updated_at)
    values (p_rate_key, 1, now(), now());
    return;
  end if;
  if r.window_started_at < now() - interval '15 minutes' then
    update public.admin_login_rate_limits set failures=1, window_started_at=now(), blocked_until=null, updated_at=now() where rate_key=p_rate_key;
  elsif r.failures + 1 >= 5 then
    update public.admin_login_rate_limits set failures=r.failures+1, blocked_until=now()+interval '30 minutes', updated_at=now() where rate_key=p_rate_key;
  else
    update public.admin_login_rate_limits set failures=r.failures+1, updated_at=now() where rate_key=p_rate_key;
  end if;
end;
$$;

create or replace function public.clear_admin_login_failures(p_rate_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_roles where user_id=auth.uid()) then
    raise exception 'admin access required';
  end if;
  delete from public.admin_login_rate_limits where rate_key=p_rate_key;
end;
$$;

revoke all on function public.check_admin_login_rate_limit(text) from public;
grant execute on function public.check_admin_login_rate_limit(text) to anon, authenticated;
revoke all on function public.record_admin_login_failure(text) from public;
grant execute on function public.record_admin_login_failure(text) to anon, authenticated;
revoke all on function public.clear_admin_login_failures(text) from public;
grant execute on function public.clear_admin_login_failures(text) to authenticated;

create or replace function public.claim_due_pickup_reminders(p_limit integer default 25)
returns table (
  job_id uuid,
  collection_request_id uuid,
  user_id uuid,
  reminder_kind text,
  channel text,
  scheduled_window_start timestamptz,
  scheduled_window_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;
  return query
  with due as (
    select j.id
    from public.pickup_reminder_jobs j
    join public.collection_requests r on r.id=j.collection_request_id
    where j.status='pending'
      and j.scheduled_at <= now()
      and r.status not in ('cancelled','completed','collected')
      and r.confirmation_status <> 'cancelled'
    order by j.scheduled_at
    for update of j skip locked
    limit greatest(1, least(p_limit,100))
  ), claimed as (
    update public.pickup_reminder_jobs j
    set status='processing', updated_at=now(), last_error=null
    from due
    where j.id=due.id
    returning j.id,j.collection_request_id,j.reminder_kind,j.channel
  )
  select c.id,c.collection_request_id,r.user_id,c.reminder_kind,c.channel,r.scheduled_window_start,r.scheduled_window_end
  from claimed c join public.collection_requests r on r.id=c.collection_request_id;
end;
$$;

create or replace function public.complete_pickup_reminder(p_job_id uuid, p_success boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then raise exception 'service role required'; end if;
  update public.pickup_reminder_jobs
  set status=case when p_success then 'sent' else 'failed' end,
      sent_at=case when p_success then now() else sent_at end,
      last_error=case when p_success then null else left(coalesce(p_error,'delivery failed'),500) end,
      updated_at=now()
  where id=p_job_id;
end;
$$;

revoke all on function public.claim_due_pickup_reminders(integer) from public,anon,authenticated;
grant execute on function public.claim_due_pickup_reminders(integer) to service_role;
revoke all on function public.complete_pickup_reminder(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_pickup_reminder(uuid,boolean,text) to service_role;
