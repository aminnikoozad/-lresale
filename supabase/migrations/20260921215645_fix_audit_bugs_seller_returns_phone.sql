grant insert on table public.collection_requests to authenticated;

drop policy if exists return_requests_insert_own on public.return_requests;
create policy return_requests_insert_own
on public.return_requests
for insert
to authenticated
with check (
  (select auth.uid()) = buyer_id
  and exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = return_requests.order_item_id
      and oi.order_id = return_requests.order_id
      and o.id = return_requests.order_id
      and o.buyer_id = (select auth.uid())
      and o.status = 'delivered'
      and o.payment_status = 'paid'
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_id_order_id_key'
  ) then
    alter table public.order_items
      add constraint order_items_id_order_id_key unique (id, order_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.return_requests'::regclass
      and conname = 'return_requests_order_item_order_fkey'
  ) then
    alter table public.return_requests
      add constraint return_requests_order_item_order_fkey
      foreign key (order_item_id, order_id)
      references public.order_items(id, order_id)
      on delete cascade;
  end if;
end
$$;

grant update (phone) on table public.profiles to authenticated;

create or replace function private.enforce_profile_phone_matches_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_phone text;
  v_phone_change text;
begin
  if new.phone is not distinct from old.phone then
    return new;
  end if;

  -- Only constrain ordinary signed-in users. Database maintenance and
  -- service-role operations remain unaffected.
  if v_role <> 'authenticated' then
    return new;
  end if;

  if v_uid is null or new.id <> v_uid then
    raise exception 'Profile phone update is not allowed for this user'
      using errcode = '42501';
  end if;

  select u.phone, nullif(u.phone_change, '')
    into v_phone, v_phone_change
  from auth.users u
  where u.id = v_uid;

  if not found then
    raise exception 'Authenticated user was not found'
      using errcode = '42501';
  end if;

  if new.phone is distinct from v_phone
     and new.phone is distinct from v_phone_change then
    raise exception 'Profile phone must match the confirmed or pending Auth phone'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_profile_phone_matches_auth() from public;
revoke all on function private.enforce_profile_phone_matches_auth() from anon;
revoke all on function private.enforce_profile_phone_matches_auth() from authenticated;

drop trigger if exists profiles_phone_matches_auth on public.profiles;
create trigger profiles_phone_matches_auth
before update of phone on public.profiles
for each row
execute function private.enforce_profile_phone_matches_auth();
