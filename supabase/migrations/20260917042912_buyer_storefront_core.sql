alter table public.items
  add column if not exists color text,
  add column if not exists material text,
  add column if not exists pattern text,
  add column if not exists condition_notes text;

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  notify_price_drop boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.price_drop_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  old_price_cents integer not null check (old_price_cents > 0),
  new_price_cents integer not null check (new_price_cents > 0 and new_price_cents < old_price_cents),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists price_drop_alerts_user_created_idx on public.price_drop_alerts(user_id, created_at desc);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','paid','processing','shipped','delivered','cancelled','refunded')),
  payment_status text not null default 'not_configured' check (payment_status in ('not_configured','pending','paid','failed','refunded')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer check (shipping_cents is null or shipping_cents >= 0),
  total_cents integer check (total_cents is null or total_cents >= subtotal_cents),
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  address_line1 text not null check (char_length(address_line1) between 5 and 200),
  address_line2 text,
  city text not null check (char_length(city) between 2 and 100),
  province text not null check (char_length(province) between 2 and 50),
  postal_code text not null check (char_length(postal_code) between 3 and 20),
  country text not null default 'CA' check (country = 'CA'),
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_buyer_created_idx on public.orders(buyer_id, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  item_name text not null,
  brand text not null,
  size text,
  item_condition text,
  unit_price_cents integer not null check (unit_price_cents > 0),
  quantity integer not null default 1 check (quantity = 1),
  created_at timestamptz not null default now(),
  unique(order_id, item_id)
);
create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  reason text not null check (reason in ('not_as_described','damaged','wrong_item','fit_or_preference','other')),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'submitted' check (status in ('submitted','reviewing','approved','denied','refunded','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id)
);
create index if not exists return_requests_buyer_created_idx on public.return_requests(buyer_id, created_at desc);

alter table public.favorites enable row level security;
alter table public.price_drop_alerts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.return_requests enable row level security;

revoke all on public.favorites, public.price_drop_alerts, public.orders, public.order_items, public.return_requests from public, anon, authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
grant select, update(read_at) on public.price_drop_alerts to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant select, insert on public.return_requests to authenticated;

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own on public.favorites for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists favorites_update_own on public.favorites;
create policy favorites_update_own on public.favorites for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own on public.favorites for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists price_drop_alerts_select_own on public.price_drop_alerts;
create policy price_drop_alerts_select_own on public.price_drop_alerts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists price_drop_alerts_update_own on public.price_drop_alerts;
create policy price_drop_alerts_update_own on public.price_drop_alerts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders for select to authenticated using ((select auth.uid()) = buyer_id);
drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));

drop policy if exists return_requests_select_own on public.return_requests;
create policy return_requests_select_own on public.return_requests for select to authenticated using ((select auth.uid()) = buyer_id);
drop policy if exists return_requests_insert_own on public.return_requests;
create policy return_requests_insert_own on public.return_requests for insert to authenticated with check (
  (select auth.uid()) = buyer_id
  and exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id and oi.order_id = order_id and o.buyer_id = (select auth.uid()) and o.status = 'delivered' and o.payment_status = 'paid'
  )
);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders for each row execute function private.set_updated_at();
drop trigger if exists return_requests_set_updated_at on public.return_requests;
create trigger return_requests_set_updated_at before update on public.return_requests for each row execute function private.set_updated_at();

create or replace function private.enqueue_price_drop_alerts()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.listed_price_cents is not null and new.listed_price_cents is not null and new.listed_price_cents < old.listed_price_cents then
    insert into public.price_drop_alerts(user_id,item_id,old_price_cents,new_price_cents)
    select f.user_id,new.id,old.listed_price_cents,new.listed_price_cents
    from public.favorites f where f.item_id=new.id and f.notify_price_drop=true;
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_price_drop_alerts() from public, anon, authenticated;
drop trigger if exists items_price_drop_alerts on public.items;
create trigger items_price_drop_alerts after update of listed_price_cents on public.items for each row execute function private.enqueue_price_drop_alerts();

drop function if exists public.create_checkout_order(uuid[],text,text,text,text,text,text);
create function public.create_checkout_order(item_ids uuid[],recipient_name text,address_line1 text,address_line2 text,city text,province text,postal_code text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare uid uuid := auth.uid(); oid uuid; expected_count integer; available_count integer; subtotal integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  expected_count := cardinality(item_ids);
  if expected_count is null or expected_count < 1 or expected_count > 25 then raise exception 'Cart must contain 1 to 25 items'; end if;
  if expected_count <> (select count(distinct x) from unnest(item_ids) x) then raise exception 'Duplicate items are not allowed'; end if;
  if char_length(trim(recipient_name)) not between 2 and 120 or char_length(trim(address_line1)) not between 5 and 200 or char_length(trim(city)) not between 2 and 100 or char_length(trim(province)) not between 2 and 50 or char_length(trim(postal_code)) not between 3 and 20 then raise exception 'Invalid shipping address'; end if;
  select count(*),coalesce(sum(coalesce(i.listed_price_cents,i.initial_approved_price_cents)),0) into available_count,subtotal
  from public.items i where i.id=any(item_ids) and i.status='listed' and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null;
  if available_count <> expected_count then raise exception 'One or more items are no longer available'; end if;
  insert into public.orders(buyer_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,recipient_name,address_line1,address_line2,city,province,postal_code)
  values(uid,'awaiting_payment','not_configured',subtotal,null,null,trim(recipient_name),trim(address_line1),nullif(trim(address_line2),''),trim(city),trim(province),upper(trim(postal_code))) returning id into oid;
  insert into public.order_items(order_id,item_id,item_name,brand,size,item_condition,unit_price_cents)
  select oid,i.id,i.name,coalesce(i.brand,'Unbranded'),i.size,i.item_condition,coalesce(i.listed_price_cents,i.initial_approved_price_cents)
  from public.items i where i.id=any(item_ids) and i.status='listed';
  return oid;
end;
$$;
revoke all on function public.create_checkout_order(uuid[],text,text,text,text,text,text) from public, anon;
grant execute on function public.create_checkout_order(uuid[],text,text,text,text,text,text) to authenticated;

drop function if exists public.catalog_items();
create function public.catalog_items()
returns table(item_id uuid,name text,brand text,category text,size text,item_condition text,color text,material text,pattern text,photo_url text,price_cents integer,published_at timestamptz)
language sql stable security definer set search_path=''
as $$
 select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.size,i.item_condition,i.color,i.material,i.pattern,case when cardinality(i.photo_urls)>0 then i.photo_urls[1] else null end,coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at
 from public.items i where i.status='listed' and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null order by i.published_at desc nulls last,i.created_at desc limit 1000;
$$;
revoke all on function public.catalog_items() from public;
grant execute on function public.catalog_items() to anon,authenticated;

drop function if exists public.catalog_item_detail(uuid);
create function public.catalog_item_detail(target_item_id uuid)
returns table(item_id uuid,name text,brand text,category text,size text,item_condition text,color text,material text,pattern text,condition_notes text,photo_urls text[],description text,price_cents integer,published_at timestamptz,inspected_at timestamptz)
language sql stable security definer set search_path=''
as $$
 select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.size,i.item_condition,i.color,i.material,i.pattern,i.condition_notes,i.photo_urls,i.description,coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at,i.inspected_at
 from public.items i where i.id=target_item_id and i.status='listed' and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null limit 1;
$$;
revoke all on function public.catalog_item_detail(uuid) from public;
grant execute on function public.catalog_item_detail(uuid) to anon,authenticated;
