-- Fix service-role-only reminder worker RPCs.
-- SECURITY DEFINER executes with the function owner's privileges, so current_user
-- reflects the definer rather than the PostgREST caller. Caller authorization is
-- enforced with EXECUTE privileges instead.

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
  from claimed c
  join public.collection_requests r on r.id=c.collection_request_id;
end;
$$;

create or replace function public.complete_pickup_reminder(
  p_job_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pickup_reminder_jobs
  set status=case when p_success then 'sent' else 'failed' end,
      sent_at=case when p_success then now() else sent_at end,
      last_error=case when p_success then null else left(coalesce(p_error,'delivery failed'),500) end,
      updated_at=now()
  where id=p_job_id;
end;
$$;

revoke all on function public.claim_due_pickup_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_pickup_reminders(integer) to service_role;

revoke all on function public.complete_pickup_reminder(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.complete_pickup_reminder(uuid,boolean,text) to service_role;

-- This function already checks for an admin user internally; anonymous callers
-- do not need EXECUTE permission at all.
revoke execute on function public.clear_admin_login_failures(text) from anon;
