-- Server-only purchase ledger. One irreversible purchase attempt per order.
create table public.order_shipping_labels (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  status text not null default 'quoted' check(status in ('quoted','submitting','created','review_required')),
  request jsonb not null,
  configuration_hash text not null,
  estimate_cents integer not null check(estimate_cents >= 0),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  purchased_by uuid references auth.users(id),
  shipment_id text,
  tracking_number text,
  artifact_url text,
  charged_cents integer check(charged_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status <> 'created' or (shipment_id is not null and tracking_number is not null and artifact_url is not null and charged_cents is not null))
);
alter table public.order_shipping_labels enable row level security;
revoke all on public.order_shipping_labels from public,anon,authenticated;
grant select,insert,update on public.order_shipping_labels to service_role;

-- The row lock and conditional update run before the carrier POST, in one transaction.
create function public.begin_order_label_purchase(p_label uuid,p_actor uuid,p_request_id text,p_configuration_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare label public.order_shipping_labels%rowtype; target public.orders%rowtype;
begin
  select * into label from public.order_shipping_labels where id=p_label for update;
  if not found or label.status<>'quoted' or label.expires_at<=now()
    or label.request->>'requestId' is distinct from p_request_id
    or label.configuration_hash is distinct from p_configuration_hash then raise exception 'Quote unavailable'; end if;
  select * into target from public.orders where id=label.order_id for update;
  if target.payment_status<>'paid' or target.paid_at is null or target.status not in ('paid','processing') or target.tracking_number is not null then raise exception 'Paid unshipped order required'; end if;
  if not exists(select 1 from public.admin_roles where user_id=p_actor and (role='owner' or can_manage_shipping)) then raise exception 'Shipping staff required'; end if;
  -- Refuse an address changed after the estimate was prepared.
  if target.recipient_name is distinct from label.request->'destination'->>'name'
    or target.address_line1 is distinct from label.request->'destination'->'addressDetails'->>'addressLine1'
    or coalesce(target.address_line2,'') is distinct from coalesce(label.request->'destination'->'addressDetails'->>'addressLine2','')
    or target.city is distinct from label.request->'destination'->'addressDetails'->>'city'
    or target.province is distinct from label.request->'destination'->'addressDetails'->>'provState'
    or upper(regexp_replace(target.postal_code,'\s','','g')) is distinct from label.request->'destination'->'addressDetails'->>'postalZipCode'
    then raise exception 'Address changed; refresh estimate'; end if;
  update public.order_shipping_labels set status='submitting',purchased_by=p_actor,updated_at=now() where id=p_label;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason)
  values(p_actor,'shipping_label_purchase_started','order',label.order_id::text,jsonb_build_object('label',p_label,'estimate_cents',label.estimate_cents),'Staff confirmed Canada Post postage purchase');
  return to_jsonb(label);
end $$;
revoke all on function public.begin_order_label_purchase(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_order_label_purchase(uuid,uuid,text,text) to service_role;
