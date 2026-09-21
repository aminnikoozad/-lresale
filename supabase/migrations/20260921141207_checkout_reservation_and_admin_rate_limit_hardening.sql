create or replace function public.create_checkout_order(
  item_ids uuid[],
  recipient_name text,
  address_line1 text,
  address_line2 text,
  city text,
  province text,
  postal_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  oid uuid;
  expected_count integer;
  available_count integer;
  active_count integer;
  subtotal integer;
  reservation_until timestamptz := now() + interval '10 minutes';
begin
  if uid is null then raise exception 'Authentication required'; end if;
  expected_count := cardinality(item_ids);
  if expected_count is null or expected_count < 1 or expected_count > 25 then raise exception 'Cart must contain 1 to 25 items'; end if;
  if expected_count <> (select count(distinct x) from unnest(item_ids) x) then raise exception 'Duplicate items are not allowed'; end if;
  if char_length(trim(recipient_name)) not between 2 and 120
    or char_length(trim(address_line1)) not between 5 and 200
    or char_length(trim(city)) not between 2 and 100
    or char_length(trim(province)) not between 2 and 50
    or char_length(trim(postal_code)) not between 3 and 20
  then raise exception 'Invalid shipping address'; end if;

  update public.inventory_reservations
     set status='expired', updated_at=now()
   where status='active'
     and expires_at <= now()
     and (item_id = any(item_ids) or buyer_id = uid);

  perform i.id
    from public.items i
   where i.id = any(item_ids)
   order by i.id
   for update;

  select count(*), coalesce(sum(coalesce(i.listed_price_cents,i.initial_approved_price_cents)),0)
    into available_count, subtotal
    from public.items i
   where i.id = any(item_ids)
     and i.status='listed'
     and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null;

  if available_count <> expected_count then raise exception 'One or more items are no longer available'; end if;

  if exists (
    select 1
      from public.inventory_reservations r
     where r.item_id = any(item_ids)
       and r.status='active'
       and r.expires_at > now()
  ) then
    raise exception 'One or more items are temporarily reserved';
  end if;

  select count(*) into active_count
    from public.inventory_reservations r
   where r.buyer_id=uid
     and r.status='active'
     and r.expires_at > now();

  if active_count + expected_count > 25 then
    raise exception 'Too many active checkout reservations';
  end if;

  insert into public.orders(
    buyer_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,
    recipient_name,address_line1,address_line2,city,province,postal_code,reservation_expires_at
  ) values(
    uid,'awaiting_payment','not_configured',subtotal,null,null,
    trim(recipient_name),trim(address_line1),nullif(trim(address_line2),''),trim(city),trim(province),upper(trim(postal_code)),reservation_until
  ) returning id into oid;

  insert into public.order_items(order_id,item_id,item_name,brand,size,item_condition,unit_price_cents)
  select oid,i.id,i.name,coalesce(i.brand,'Unbranded'),i.size,i.item_condition,coalesce(i.listed_price_cents,i.initial_approved_price_cents)
    from public.items i
   where i.id=any(item_ids)
     and i.status='listed';

  insert into public.inventory_reservations(order_id,item_id,buyer_id,status,expires_at)
  select oid,i.id,uid,'active',reservation_until
    from public.items i
   where i.id=any(item_ids)
   order by i.id;

  return oid;
end;
$function$;

create or replace function public.catalog_items()
returns table(item_id uuid, name text, brand text, category text, size text, item_condition text, color text, material text, pattern text, photo_url text, price_cents integer, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
 select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.size,i.item_condition,i.color,i.material,i.pattern,
        case when cardinality(i.photo_urls)>0 then i.photo_urls[1] else null end,
        coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at
 from public.items i
 where i.status='listed'
   and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
   and not exists (
     select 1 from public.inventory_reservations r
      where r.item_id=i.id and r.status='active' and r.expires_at>now()
   )
 order by i.published_at desc nulls last,i.created_at desc
 limit 1000;
$function$;

create or replace function public.catalog_item_detail(target_item_id uuid)
returns table(item_id uuid, name text, brand text, category text, size text, item_condition text, color text, material text, pattern text, condition_notes text, photo_urls text[], description text, price_cents integer, published_at timestamptz, inspected_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
 select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.size,i.item_condition,i.color,i.material,i.pattern,i.condition_notes,i.photo_urls,i.description,
        coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at,i.inspected_at
 from public.items i
 where i.id=target_item_id
   and i.status='listed'
   and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
   and not exists (
     select 1 from public.inventory_reservations r
      where r.item_id=i.id and r.status='active' and r.expires_at>now()
   )
 limit 1;
$function$;

create or replace function public.home_catalog_details(target_item_id uuid default null::uuid)
returns table(item_id uuid, details jsonb, photos jsonb, price_drop boolean)
language sql
stable
security definer
set search_path = ''
as $function$
 select i.id,private.home_public_data(h.public_data)||jsonb_build_object('disclosed_defects',to_jsonb(h.defects)),h.photos,
        coalesce(i.listed_price_cents<i.initial_approved_price_cents,false)
 from public.items i
 join public.home_item_details h on h.item_id=i.id
 where i.category='home_decor'
   and i.status='listed'
   and (target_item_id is null or i.id=target_item_id)
   and not exists (
     select 1 from public.inventory_reservations r
      where r.item_id=i.id and r.status='active' and r.expires_at>now()
   );
$function$;

create or replace function public.check_admin_login_rate_limit(p_rate_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare r public.admin_login_rate_limits%rowtype;
begin
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 900);
  end if;
  select * into r from public.admin_login_rate_limits where rate_key=p_rate_key;
  if not found then return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0); end if;
  if r.blocked_until is not null and r.blocked_until > now() then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', greatest(1, extract(epoch from (r.blocked_until-now()))::integer));
  end if;
  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end;
$function$;

create or replace function public.record_admin_login_failure(p_rate_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare r public.admin_login_rate_limits%rowtype;
begin
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then return; end if;

  perform pg_catalog.pg_advisory_xact_lock(1877661221::bigint);

  delete from public.admin_login_rate_limits
   where updated_at < now() - interval '2 hours'
     and (blocked_until is null or blocked_until <= now());

  select * into r from public.admin_login_rate_limits where rate_key=p_rate_key for update;
  if not found then
    if (select count(*) from public.admin_login_rate_limits) >= 2048 then
      delete from public.admin_login_rate_limits
       where rate_key = (
         select rate_key from public.admin_login_rate_limits
          where blocked_until is null or blocked_until <= now()
          order by updated_at asc
          limit 1
       );
    end if;

    if (select count(*) from public.admin_login_rate_limits) >= 2048 then return; end if;

    insert into public.admin_login_rate_limits(rate_key,failures,window_started_at,updated_at)
    values(p_rate_key,1,now(),now());
    return;
  end if;

  if r.window_started_at < now() - interval '15 minutes' then
    update public.admin_login_rate_limits
       set failures=1, window_started_at=now(), blocked_until=null, updated_at=now()
     where rate_key=p_rate_key;
  elsif r.failures + 1 >= 5 then
    update public.admin_login_rate_limits
       set failures=r.failures+1, blocked_until=now()+interval '30 minutes', updated_at=now()
     where rate_key=p_rate_key;
  else
    update public.admin_login_rate_limits
       set failures=r.failures+1, updated_at=now()
     where rate_key=p_rate_key;
  end if;
end;
$function$;

revoke all on function public.check_admin_login_rate_limit(text) from public;
revoke all on function public.record_admin_login_failure(text) from public;
revoke all on function public.clear_admin_login_failures(text) from public;
grant execute on function public.check_admin_login_rate_limit(text) to anon, authenticated, service_role;
grant execute on function public.record_admin_login_failure(text) to anon, authenticated, service_role;
grant execute on function public.clear_admin_login_failures(text) to authenticated, service_role;
