-- Provider-independent boundary. No provider is selected, no public payment route is enabled.
create table private.buyer_payment_connection (
 id boolean primary key default true check(id),provider text,enabled boolean not null default false
);
insert into private.buyer_payment_connection(id) values(true);
revoke all on private.buyer_payment_connection from public,anon,authenticated,service_role;

create function public.accept_verified_buyer_payment(p_attempt uuid,p_event text,p_payment text,p_digest text,p_amount integer,p_currency text,p_success boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.order_payment_attempts%rowtype;o public.orders%rowtype;e public.payment_webhook_events%rowtype; configured text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted payment adapter required';end if;
 select provider into configured from private.buyer_payment_connection where id and enabled;
 if configured is null then raise exception 'Payment connection not configured';end if;
 select * into a from public.order_payment_attempts where id=p_attempt;
 if not found or a.provider<>configured then raise exception 'Payment attempt unavailable';end if;
 -- All successful checkouts for this buyer use the same lock, including ones without a discount.
 perform pg_advisory_xact_lock(hashtextextended(a.buyer_id::text,137));
 select * into o from public.orders where id=a.order_id for update;
 select * into a from public.order_payment_attempts where id=p_attempt for update;
 if o.buyer_id<>a.buyer_id or p_currency is distinct from 'CAD' or p_amount is distinct from a.expected_total_cents or p_amount is distinct from o.total_cents then raise exception 'Payment amount or identity mismatch';end if;
 if p_success is null then raise exception 'Payment outcome required';end if;
 if p_payment is null or length(p_payment) not between 1 and 255 then raise exception 'Provider payment evidence required';end if;
 insert into public.payment_webhook_events(provider,provider_event_id,event_type,payload_sha256,order_id)
 values(a.provider,p_event,case when p_success then 'payment.succeeded' else 'payment.failed' end,p_digest,o.id) on conflict(provider,provider_event_id) do nothing;
 select * into e from public.payment_webhook_events where provider=a.provider and provider_event_id=p_event for update;
 if e.payload_sha256<>p_digest or e.order_id<>o.id or e.event_type<>(case when p_success then 'payment.succeeded' else 'payment.failed' end) then raise exception 'Conflicting replay';end if;
 if e.status='processed' then return o.id;end if;
 if o.payment_status='paid' and o.payment_provider=a.provider and o.provider_payment_id=p_payment then
  update public.payment_webhook_events set status='processed',processed_at=now() where id=e.id;return o.id;
 end if;
 if a.status not in ('created','pending') or o.status<>'awaiting_payment' or o.payment_status not in ('not_configured','pending') then raise exception 'Order not awaiting this payment';end if;
 if p_success then
  if o.reservation_expires_at<=now() or o.buyer_terms_accepted_at is null or o.tax_cents is null or o.shipping_cents is null then raise exception 'Checkout incomplete or expired; manual payment review required';end if;
  perform i.id from public.items i join public.order_items oi on oi.item_id=i.id where oi.order_id=o.id order by i.id for update of i;
  if not exists(select 1 from public.order_items where order_id=o.id) or exists(select 1 from public.order_items oi join public.items i on i.id=oi.item_id where oi.order_id=o.id and (i.status<>'listed' or i.listed_price_cents<>oi.unit_price_cents or not exists(select 1 from public.inventory_reservations r where r.order_id=o.id and r.item_id=i.id and r.status='active' and r.expires_at>now()))) then raise exception 'Inventory no longer reserved for this checkout';end if;
  update public.orders set status='paid',payment_status='paid',paid_at=now(),payment_provider=a.provider,provider_payment_id=p_payment,provider_checkout_id=a.provider_checkout_id,updated_at=now() where id=o.id;
  update public.order_payment_attempts set status='succeeded',updated_at=now() where id=a.id;
 else
  update public.order_payment_attempts set status='failed',updated_at=now() where id=a.id;
  update public.orders set payment_status='failed',status='cancelled',cancelled_at=now(),updated_at=now() where id=o.id;
  update public.inventory_reservations set status='released',updated_at=now() where order_id=o.id and status='active';
 end if;
 update public.payment_webhook_events set status='processed',processed_at=now(),processing_attempts=processing_attempts+1 where id=e.id;
 return o.id;
end $$;
revoke all on function public.accept_verified_buyer_payment(uuid,text,text,text,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.accept_verified_buyer_payment(uuid,text,text,text,integer,text,boolean) to service_role;

-- Refunds are provider-confirmed facts. Approving a return never inserts one.
create table public.verified_buyer_refunds (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 provider text not null,provider_refund_id text not null,amount_cents integer not null check(amount_cents>0),
 merchandise_cents integer not null check(merchandise_cents>=0),shipping_cents integer not null check(shipping_cents>=0),tax_cents integer not null check(tax_cents>=0),
 lines jsonb not null check(jsonb_typeof(lines)='array'),confirmed_at timestamptz not null default now(),
 seller_reconciliation_status text not null default 'pending_review' check(seller_reconciliation_status in ('pending_review','reconciled')),
 check(amount_cents=merchandise_cents+shipping_cents+tax_cents),unique(provider,provider_refund_id)
);
alter table public.verified_buyer_refunds enable row level security;
revoke all on public.verified_buyer_refunds from public,anon,authenticated,service_role;
create function public.record_verified_buyer_refund(p_order uuid,p_provider text,p_refund text,p_lines jsonb,p_shipping integer,p_tax integer) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;r public.verified_buyer_refunds%rowtype;line jsonb;oi public.order_items%rowtype;merch integer=0;amount integer;rid uuid;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted refund adapter required';end if;
 if not exists(select 1 from private.buyer_payment_connection where id and enabled and provider=p_provider) then raise exception 'Payment connection not configured';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.payment_provider<>p_provider or o.paid_at is null then raise exception 'Verified paid order required';end if;
 if length(p_refund) not between 1 and 255 or p_refund is null or jsonb_typeof(p_lines) is distinct from 'array' or p_shipping<0 or p_tax<0 or p_shipping is null or p_tax is null then raise exception 'Invalid refund evidence';end if;
 select * into r from public.verified_buyer_refunds where provider=p_provider and provider_refund_id=p_refund;
 if found then
  if r.order_id<>p_order or r.lines<>p_lines or r.shipping_cents<>p_shipping or r.tax_cents<>p_tax then raise exception 'Conflicting refund replay';end if;
  return r.id;
 end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct value->>'orderItemId') from jsonb_array_elements(p_lines)) then raise exception 'Duplicate refund lines';end if;
 for line in select value from jsonb_array_elements(p_lines) loop
  select * into oi from public.order_items where id=(line->>'orderItemId')::uuid and order_id=p_order;
  if not found or (line->>'cents')::integer<=0 or line->>'cents' is null or (line->>'cents')::integer+coalesce((select sum((l->>'cents')::integer) from public.verified_buyer_refunds v cross join lateral jsonb_array_elements(v.lines) l where v.order_id=p_order and l->>'orderItemId'=oi.id::text),0)>oi.unit_price_cents-oi.discount_cents then raise exception 'Refund exceeds the paid item amount';end if;
  merch:=merch+(line->>'cents')::integer;
 end loop;
 amount:=merch+p_shipping+p_tax;
 if amount<=0 or amount+coalesce((select sum(amount_cents) from public.verified_buyer_refunds where order_id=p_order),0)>o.total_cents or p_shipping+coalesce((select sum(shipping_cents) from public.verified_buyer_refunds where order_id=p_order),0)>o.shipping_cents or p_tax+coalesce((select sum(tax_cents) from public.verified_buyer_refunds where order_id=p_order),0)>o.tax_cents then raise exception 'Refund exceeds the paid order';end if;
 insert into public.verified_buyer_refunds(order_id,provider,provider_refund_id,amount_cents,merchandise_cents,shipping_cents,tax_cents,lines) values(p_order,p_provider,p_refund,amount,merch,p_shipping,p_tax,p_lines) returning id into rid;
 insert into public.sales_measurement_events(event_id,event_name,order_id,item_ids,value_cents,source) values(rid,'refund',p_order,array(select item_id from public.order_items where order_id=p_order and id::text in (select value->>'orderItemId' from jsonb_array_elements(p_lines))),merch,'verified_order');
 -- Seller reconciliation is explicitly pending. No refund entitlement restoration is invented.
 return rid;
end $$;
revoke all on function public.record_verified_buyer_refund(uuid,text,text,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.record_verified_buyer_refund(uuid,text,text,jsonb,integer,integer) to service_role;

create function public.admin_sales_campaign_state() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_buyer_sales_admin();
 return coalesce((select jsonb_agg(x) from (
  select c.id,c.campaign_key,c.channel,c.period_start,c.period_end,c.advertising_cents,c.variable_cents,
    coalesce(sum(o.subtotal_cents-o.discount_cents-coalesce(r.merch,0)),0) as net_merchandise_cents,
    coalesce(sum(o.shipping_cents-coalesce(r.shipping,0)),0) as net_shipping_cents,count(o.id) as paid_orders,
    case when c.variable_cents is null then null else coalesce(sum(o.subtotal_cents-o.discount_cents-coalesce(r.merch,0)+o.shipping_cents-coalesce(r.shipping,0)),0)-c.variable_cents-c.advertising_cents end as margin_cents
  from public.sales_campaign_costs c
  left join public.sales_order_attribution a on a.campaign_key=c.campaign_key and a.channel=c.channel
  left join public.orders o on o.id=a.order_id and o.paid_at>=c.period_start and o.paid_at<c.period_end+1
  left join lateral (select sum(merchandise_cents) merch,sum(shipping_cents) shipping from public.verified_buyer_refunds where order_id=o.id) r on true
  group by c.id order by c.period_start desc limit 100
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.admin_sales_campaign_state() from public,anon;
grant execute on function public.admin_sales_campaign_state() to authenticated;
create function public.admin_save_sales_campaign_cost(p_campaign text,p_channel text,p_start date,p_end date,p_advertising integer,p_variable integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_buyer_sales_admin();
 if length(trim(p_campaign)) not between 1 and 100 or length(trim(p_channel)) not between 1 and 50 then raise exception 'Campaign identifiers required';end if;
 if exists(select 1 from public.sales_campaign_costs where campaign_key=trim(p_campaign) and channel=trim(p_channel) and daterange(period_start,period_end,'[]') && daterange(p_start,p_end,'[]') and (period_start<>p_start or period_end<>p_end)) then raise exception 'Overlapping reporting periods';end if;
 insert into public.sales_campaign_costs(campaign_key,channel,period_start,period_end,advertising_cents,variable_cents,updated_by) values(trim(p_campaign),trim(p_channel),p_start,p_end,p_advertising,p_variable,auth.uid()) on conflict(campaign_key,channel,period_start,period_end) do update set advertising_cents=excluded.advertising_cents,variable_cents=excluded.variable_cents,updated_by=excluded.updated_by,updated_at=now();
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'campaign_cost_saved','buyer_offer',p_campaign,jsonb_build_object('channel',p_channel,'start',p_start,'end',p_end,'advertising',p_advertising,'variable',p_variable),'Manual report input; no advertising spend created');
end $$;
revoke all on function public.admin_save_sales_campaign_cost(text,text,date,date,integer,integer) from public,anon;
grant execute on function public.admin_save_sales_campaign_cost(text,text,date,date,integer,integer) to authenticated;
create function public.admin_attribute_sales_order(p_order uuid,p_campaign text,p_channel text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_buyer_sales_admin();
 if not exists(select 1 from public.orders where id=p_order and paid_at is not null) or length(trim(p_campaign)) not between 1 and 100 or length(trim(p_channel)) not between 1 and 50 then raise exception 'Verified order and attribution required';end if;
 insert into public.sales_order_attribution(order_id,campaign_key,channel) values(p_order,trim(p_campaign),trim(p_channel));
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'campaign_order_attributed','buyer_offer',p_order::text,jsonb_build_object('campaign',p_campaign,'channel',p_channel),'One attribution per verified order');
end $$;
revoke all on function public.admin_attribute_sales_order(uuid,text,text) from public,anon;
grant execute on function public.admin_attribute_sales_order(uuid,text,text) to authenticated;

-- Preserve seller base pricing; the approved platform-funded discount reduces platform earnings only.
create or replace function private.sync_paid_order_seller_wallets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  line public.order_items%rowtype;
  item_row public.items%rowtype;
  existing public.order_seller_credits%rowtype;
  original_wallet public.wallet_transactions%rowtype;
  seller_credit integer;
  wallet uuid;
  reversal_wallet uuid;
begin
  -- Paid transition: create exactly one seller wallet credit per order item.
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    for line in
      select * from public.order_items where order_id = new.id order by id
    loop
      select * into existing from public.order_seller_credits where order_item_id = line.id;
      if found then continue; end if;

      select * into item_row from public.items where id = line.item_id for update;
      if not found then raise exception 'Paid order contains an unknown item'; end if;
      if item_row.status <> 'listed' then raise exception 'Paid order item is no longer listed'; end if;
      if item_row.seller_pricing_approved_at is null
         or item_row.locked_seller_commission_bps is null
         or item_row.locked_platform_commission_bps is null
         or item_row.locked_seller_commission_bps + item_row.locked_platform_commission_bps <> 10000
      then
        raise exception 'Paid order item is missing locked seller pricing';
      end if;
      if item_row.listed_price_cents is distinct from line.unit_price_cents then
        raise exception 'Paid order item price does not match the locked order price';
      end if;
      if exists (
        select 1 from public.wallet_transactions w
         where w.item_id = item_row.id and w.transaction_type = 'sale_credit' and w.status <> 'reversed'
      ) then
        raise exception 'Seller credit already exists for this item';
      end if;

      seller_credit := round(line.unit_price_cents::numeric * item_row.locked_seller_commission_bps / 10000)::integer;
      if seller_credit <= 0 then raise exception 'Seller credit must be positive'; end if;

      insert into public.wallet_transactions(user_id,item_id,amount_cents,transaction_type,status,description)
      values(
        item_row.owner_id,
        item_row.id,
        seller_credit,
        'sale_credit',
        'pending',
        'Online sale earnings — pending settlement review'
      ) returning id into wallet;

      insert into public.order_seller_credits(
        order_item_id,order_id,item_id,seller_id,wallet_id,sale_cents,seller_bps,seller_cents
      ) values(
        line.id,new.id,item_row.id,item_row.owner_id,wallet,line.unit_price_cents,
        item_row.locked_seller_commission_bps,seller_credit
      );

      update public.items
         set status = 'sold',
             sold_price_cents = line.unit_price_cents,
             final_seller_earnings_cents = seller_credit,
             final_platform_earnings_cents = line.unit_price_cents - seller_credit - line.discount_cents
       where id = item_row.id;

      update public.inventory_reservations
         set status = 'converted', updated_at = now()
       where order_id = new.id and item_id = item_row.id and status = 'active';
    end loop;
  end if;

  -- Refunded transition: reverse the accounting credit automatically.
  if new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded' then
    for existing in
      select * from public.order_seller_credits where order_id = new.id and reversed_at is null order by order_item_id
    loop
      select * into original_wallet from public.wallet_transactions where id = existing.wallet_id for update;
      reversal_wallet := null;

      if original_wallet.status = 'pending' then
        update public.wallet_transactions set status = 'reversed' where id = original_wallet.id;
      elsif original_wallet.status = 'completed' then
        insert into public.wallet_transactions(user_id,item_id,amount_cents,transaction_type,status,description)
        values(
          existing.seller_id,
          existing.item_id,
          -existing.seller_cents,
          'adjustment',
          'completed',
          'Refund reversal of seller earnings'
        ) returning id into reversal_wallet;
      end if;

      update public.order_seller_credits
         set reversed_at = now(), reversal_wallet_id = reversal_wallet
       where order_item_id = existing.order_item_id;
    end loop;
  end if;

  return new;
end;
$$;


revoke all on function private.sync_paid_order_seller_wallets() from public,anon,authenticated;
