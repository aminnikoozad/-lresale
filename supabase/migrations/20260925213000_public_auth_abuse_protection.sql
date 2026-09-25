-- Dedicated rate limiter for public signup/login/recovery forms.
-- Keeps public traffic from consuming the much stricter admin-login failure bucket.
create table if not exists public.auth_form_rate_limits (
  rate_key text primary key check (rate_key ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0 check (attempts between 0 and 1000000),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_form_rate_limits enable row level security;
revoke all on table public.auth_form_rate_limits from public, anon, authenticated;
create index if not exists auth_form_rate_limits_updated_idx on public.auth_form_rate_limits(updated_at);

create or replace function public.consume_auth_form_attempt(p_rate_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.auth_form_rate_limits%rowtype;
  next_attempts integer;
begin
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 900);
  end if;

  -- Serialize only this IP/path bucket, not every auth request globally.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_rate_key, 0));

  delete from public.auth_form_rate_limits
   where updated_at < now() - interval '2 hours'
     and (blocked_until is null or blocked_until <= now());

  select * into r from public.auth_form_rate_limits where rate_key = p_rate_key for update;

  if not found then
    -- Bound storage during distributed abuse. Old rows above are removed first.
    if (select count(*) from public.auth_form_rate_limits) >= 4096 then
      delete from public.auth_form_rate_limits
       where rate_key = (
         select rate_key
           from public.auth_form_rate_limits
          where blocked_until is null or blocked_until <= now()
          order by updated_at asc
          limit 1
       );
    end if;
    if (select count(*) from public.auth_form_rate_limits) >= 4096 then
      return jsonb_build_object('allowed', false, 'retryAfterSeconds', 900);
    end if;

    insert into public.auth_form_rate_limits(rate_key, attempts, window_started_at, updated_at)
    values (p_rate_key, 1, now(), now());
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  if r.blocked_until is not null and r.blocked_until > now() then
    return jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', greatest(1, extract(epoch from (r.blocked_until - now()))::integer)
    );
  end if;

  if r.window_started_at < now() - interval '15 minutes' then
    update public.auth_form_rate_limits
       set attempts = 1, window_started_at = now(), blocked_until = null, updated_at = now()
     where rate_key = p_rate_key;
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  next_attempts := r.attempts + 1;
  if next_attempts >= 12 then
    update public.auth_form_rate_limits
       set attempts = next_attempts, blocked_until = now() + interval '15 minutes', updated_at = now()
     where rate_key = p_rate_key;
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 900);
  end if;

  update public.auth_form_rate_limits
     set attempts = next_attempts, updated_at = now()
   where rate_key = p_rate_key;
  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end;
$$;

revoke all on function public.consume_auth_form_attempt(text) from public;
grant execute on function public.consume_auth_form_attempt(text) to anon, authenticated;
