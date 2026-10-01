-- Provider-independent preparation and cancellation. No payment or payout transition is exposed.
-- Update these versions in the same migration as the corresponding published policies.
create table private.checkout_policy_versions (
  singleton boolean primary key default true check (singleton),
  buyer_terms_version text not null,
  return_policy_version text not null,
  privacy_notice_version text not null,
  updated_at timestamptz not null default now()
);
insert into private.checkout_policy_versions(singleton,buyer_terms_version,return_policy_version,privacy_notice_version)
values (true,'2026-09-25','2026-09-25','2026-09-25');
revoke all on private.checkout_policy_versions from public,anon,authenticated;

create or replace function public.accept_checkout_terms(
  p_order uuid,p_terms_version text,p_return_policy_version text,p_privacy_notice_version text
) returns void language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  current_order public.orders%rowtype;
  policy private.checkout_policy_versions%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into policy from private.checkout_policy_versions where singleton;
  if p_terms_version is distinct from policy.buyer_terms_version
     or p_return_policy_version is distinct from policy.return_policy_version
     or p_privacy_notice_version is distinct from policy.privacy_notice_version
  then raise exception 'Checkout policy versions changed; refresh checkout'; end if;

  select * into current_order from public.orders where id=p_order and buyer_id=uid for update;
  if not found then raise exception 'Order unavailable'; end if;
  if current_order.status <> 'awaiting_payment' or current_order.payment_status <> 'not_configured'
  then raise exception 'Order is not awaiting payment'; end if;
  if current_order.reservation_expires_at is null or current_order.reservation_expires_at <= now()
  then raise exception 'Checkout reservation expired'; end if;

  update public.orders set buyer_terms_version=policy.buyer_terms_version,
    return_policy_version=policy.return_policy_version,
    privacy_notice_version=policy.privacy_notice_version,
    buyer_terms_accepted_at=coalesce(buyer_terms_accepted_at,now()),updated_at=now()
  where id=p_order and buyer_id=uid;
end $$;
revoke all on function public.accept_checkout_terms(uuid,text,text,text) from public,anon;
grant execute on function public.accept_checkout_terms(uuid,text,text,text) to authenticated,service_role;

create function public.prepare_checkout_with_terms(
  p_items uuid[],p_quote uuid,p_service text,
  p_recipient_name text,p_address_line1 text,p_address_line2 text,
  p_city text,p_province text,p_postal_code text,
  p_terms_version text,p_return_policy_version text,p_privacy_notice_version text
) returns uuid language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_quote is null then
    if p_service is not null then raise exception 'Shipping service requires a quote'; end if;
    oid:=public.create_checkout_order(p_items,p_recipient_name,p_address_line1,p_address_line2,p_city,p_province,p_postal_code);
  else
    if p_items is not null or p_service is null or char_length(trim(p_service))<1
    then raise exception 'Choose one quoted shipping service'; end if;
    oid:=public.create_postal_checkout(p_quote,p_service,p_recipient_name,p_address_line1,p_address_line2,p_city,p_province,p_postal_code);
  end if;
  perform public.accept_checkout_terms(oid,p_terms_version,p_return_policy_version,p_privacy_notice_version);
  return oid;
end $$;
revoke all on function public.prepare_checkout_with_terms(uuid[],uuid,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.prepare_checkout_with_terms(uuid[],uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;

create function public.cancel_prepared_checkout(p_order uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare current_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into current_order from public.orders where id=p_order and buyer_id=auth.uid() for update;
  if not found then raise exception 'Order unavailable'; end if;
  if current_order.status='cancelled' then return false; end if;
  if current_order.status<>'awaiting_payment' or current_order.payment_status not in ('not_configured','failed')
  then raise exception 'Order cannot be cancelled here'; end if;
  if exists (select 1 from public.order_payment_attempts
             where order_id=p_order and status in ('created','pending','succeeded'))
  then raise exception 'Payment status needs review before cancellation'; end if;

  update public.orders set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_order;
  update public.inventory_reservations set status='released',updated_at=now()
    where order_id=p_order and status='active';
  return true;
end $$;
revoke all on function public.cancel_prepared_checkout(uuid) from public,anon;
grant execute on function public.cancel_prepared_checkout(uuid) to authenticated;

-- A trusted server scheduler can call this RPC using a service key. No browser role can execute it.
create function public.expire_prepared_checkouts(p_limit integer default 200)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_limit not between 1 and 500 then raise exception 'Invalid batch size'; end if;
  with targets as (
    select id from public.orders
    where status='awaiting_payment' and payment_status in ('not_configured','failed')
      and reservation_expires_at<=now()
      and not exists (select 1 from public.order_payment_attempts a
                      where a.order_id=orders.id and a.status in ('created','pending','succeeded'))
    order by reservation_expires_at,id limit p_limit for update skip locked
  ), expired as (
    update public.orders o set status='cancelled',cancelled_at=now(),updated_at=now()
    from targets t where o.id=t.id returning o.id
  ), released as (
    update public.inventory_reservations r set status='expired',updated_at=now()
    where r.order_id in (select id from expired) and r.status='active' returning r.id
  )
  select count(*) into changed from expired;
  return changed;
end $$;
revoke all on function public.expire_prepared_checkouts(integer) from public,anon,authenticated;
grant execute on function public.expire_prepared_checkouts(integer) to service_role;
