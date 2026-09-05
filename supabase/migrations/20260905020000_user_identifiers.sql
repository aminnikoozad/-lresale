-- Add stable customer identifiers and unique usernames.

alter table public.profiles
  add column if not exists username text,
  add column if not exists customer_code text;

-- Backfill all existing customers with deterministic identifiers.
update public.profiles
set customer_code = 'RW-' || upper(substr(replace(id::text, '-', ''), 1, 16))
where customer_code is null;

update public.profiles
set username = (
  case
    when length(trim(both '_' from lower(regexp_replace(coalesce(full_name, ''), '[^a-zA-Z0-9]+', '_', 'g')))) >= 3
      then left(trim(both '_' from lower(regexp_replace(coalesce(full_name, ''), '[^a-zA-Z0-9]+', '_', 'g'))), 21)
    else 'user'
  end
) || '_' || substr(replace(id::text, '-', ''), 1, 8)
where username is null;

alter table public.profiles
  alter column username set not null,
  alter column customer_code set not null;

alter table public.profiles
  drop constraint if exists profiles_username_format,
  add constraint profiles_username_format
    check (username ~ '^[a-z0-9][a-z0-9._]{2,29}$'),
  drop constraint if exists profiles_customer_code_format,
  add constraint profiles_customer_code_format
    check (customer_code ~ '^RW-[A-F0-9]{16}$');

create unique index if not exists profiles_username_lower_unique_idx
  on public.profiles (lower(username));

create unique index if not exists profiles_customer_code_unique_idx
  on public.profiles (customer_code);

-- Safe availability check for signup. It reveals only a boolean.
create or replace function public.is_username_available(candidate text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    candidate ~ '^[a-z0-9][a-z0-9._]{2,29}$'
    and not exists (
      select 1
      from public.profiles
      where lower(username) = lower(candidate)
    );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Extend the auth trigger so every new account receives both identifiers.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  generated_username text;
  generated_code text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  generated_code := 'RW-' || upper(substr(replace(new.id::text, '-', ''), 1, 16));

  if requested_username ~ '^[a-z0-9][a-z0-9._]{2,29}$' then
    generated_username := requested_username;
  else
    generated_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  insert into public.profiles (id, full_name, phone, username, customer_code)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100), ''),
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'phone_e164', '')), 30), ''),
    generated_username,
    generated_code
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
