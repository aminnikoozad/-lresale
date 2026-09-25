alter table public.orders
  add column if not exists buyer_terms_version text,
  add column if not exists return_policy_version text,
  add column if not exists privacy_notice_version text,
  add column if not exists buyer_terms_accepted_at timestamptz;

create or replace function public.accept_checkout_terms(
  p_order uuid,
  p_terms_version text,
  p_return_policy_version text,
  p_privacy_notice_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  current_order public.orders%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_terms_version is null or char_length(trim(p_terms_version)) not between 1 and 40
     or p_return_policy_version is null or char_length(trim(p_return_policy_version)) not between 1 and 40
     or p_privacy_notice_version is null or char_length(trim(p_privacy_notice_version)) not between 1 and 40
  then raise exception 'Policy versions required'; end if;

  select * into current_order
    from public.orders
   where id = p_order and buyer_id = uid
   for update;
  if not found then raise exception 'Order unavailable'; end if;
  if current_order.status <> 'awaiting_payment' then raise exception 'Order is not awaiting payment'; end if;
  if current_order.reservation_expires_at is null or current_order.reservation_expires_at <= now() then
    raise exception 'Checkout reservation expired';
  end if;

  update public.orders
     set buyer_terms_version = trim(p_terms_version),
         return_policy_version = trim(p_return_policy_version),
         privacy_notice_version = trim(p_privacy_notice_version),
         buyer_terms_accepted_at = coalesce(buyer_terms_accepted_at, now()),
         updated_at = now()
   where id = p_order and buyer_id = uid;
end;
$function$;

revoke all on function public.accept_checkout_terms(uuid,text,text,text) from public, anon;
grant execute on function public.accept_checkout_terms(uuid,text,text,text) to authenticated, service_role;
