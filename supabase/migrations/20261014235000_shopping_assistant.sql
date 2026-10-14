-- Customer data is protected by RLS. The assistant never uses service-role for account actions.
create table public.assistant_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 preferences jsonb not null default '{}', enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 4000)
);
alter table public.assistant_preferences enable row level security;
create policy assistant_preferences_own on public.assistant_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.assistant_preferences to authenticated;
create table public.assistant_watches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 query jsonb not null, consent_at timestamptz not null default now(), active boolean not null default true,
 created_at timestamptz not null default now(), check(jsonb_typeof(query)='object' and octet_length(query::text)<=2000)
);
alter table public.assistant_watches enable row level security;
create policy assistant_watches_own on public.assistant_watches for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.assistant_watches to authenticated;
create index assistant_watches_user_idx on public.assistant_watches(user_id) where active;
create table public.assistant_quota (bucket text primary key, used integer not null, expires_at timestamptz not null);
alter table public.assistant_quota enable row level security;
revoke all on public.assistant_quota from anon, authenticated;
create function public.assistant_take_quota(p_identity text, p_voice boolean default false) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; k text; lim integer;
begin
 delete from assistant_quota where expires_at < now();
 foreach k in array array['global:'||current_date::text, p_identity||':'||date_trunc('hour',now())::text, 'voice:'||current_date::text] loop
   if k like 'voice:%' and not p_voice then continue; end if;
   lim := case when k like 'global:%' then 500 when k like 'voice:%' then 30 else 30 end;
   insert into assistant_quota(bucket,used,expires_at) values(k,1,now()+interval '2 days')
   on conflict(bucket) do update set used=assistant_quota.used+1 returning used into n;
   if n>lim then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function public.assistant_take_quota(text,boolean) from public,anon,authenticated;
grant execute on function public.assistant_take_quota(text,boolean) to service_role;
