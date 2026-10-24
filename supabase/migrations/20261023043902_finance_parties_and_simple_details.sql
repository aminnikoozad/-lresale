-- Names are current account display names; order item titles remain purchase snapshots.
-- Read-only projection over the existing financial source of truth.
-- No rates, payment gates, balances or historical records are changed.
create or replace function public.owner_finance_report(p_kind text default 'payments',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.admin_roles where user_id=auth.uid() and role='owner')
    or (auth.jwt()->>'aal') is distinct from 'aal2' then
  raise exception 'Owner and MFA required' using errcode='42501';
 end if;
 if p_kind is null or p_kind not in ('payments','earnings','payouts') or p_page is null or p_page not between 1 and 100000 then
  raise exception 'Invalid report filter';
 end if;
 if p_kind='payments' then
  select coalesce(jsonb_agg(row order by created_at desc,id desc),'[]'::jsonb) into result from (
   select o.created_at,o.id,jsonb_build_object(
    'id',o.id,'name',coalesce(nullif(p.full_name,''),nullif(o.recipient_name,''),'—'),
    'amountCents',o.total_cents,'status',o.payment_status,'createdAt',o.created_at,
    'buyerName',coalesce(nullif(p.full_name,''),nullif(o.recipient_name,''),'—'),'orderId',o.id,'buyerId',o.buyer_id,'provider',o.payment_provider,
    'providerPaymentId',o.provider_payment_id,'currency',o.currency,'paidAt',o.paid_at,'refundedAt',o.refunded_at,
    'refunds',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'provider',r.provider,'providerRefundId',r.provider_refund_id,'amountCents',r.amount_cents,'merchandiseCents',r.merchandise_cents,'shippingCents',r.shipping_cents,'taxCents',r.tax_cents,'confirmedAt',r.confirmed_at,'sellerReconciliationStatus',r.seller_reconciliation_status) order by r.confirmed_at),'[]'::jsonb) from public.verified_buyer_refunds r where r.order_id=o.id),
    'subtotalCents',o.subtotal_cents,'discountCents',o.discount_cents,'shippingCents',o.shipping_cents,'taxCents',o.tax_cents,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('name',l.item_name,'priceCents',l.unit_price_cents,
      'saleMode',i.sale_mode,'sellerId',coalesce(c.seller_id,i.owner_id),'sellerName',coalesce(nullif(sp.full_name,''),'—'),
      'soldBy',case when i.sale_mode='managed_consignment' then 'SHIKIMOMO' else coalesce(nullif(sp.full_name,''),'—') end,
      'sellerBps',c.seller_bps,'sellerCents',c.seller_cents,
      'platformGrossCents',c.sale_cents-c.seller_cents,'platformCouponCents',l.discount_cents,
      'platformAfterCouponCents',c.sale_cents-c.seller_cents-l.discount_cents,
      'creditReversedAt',c.reversed_at) order by l.id),'[]'::jsonb)
     from public.order_items l join public.items i on i.id=l.item_id
     left join public.order_seller_credits c on c.order_item_id=l.id
     left join public.profiles sp on sp.id=coalesce(c.seller_id,i.owner_id) where l.order_id=o.id)) row
   from public.orders o left join public.profiles p on p.id=o.buyer_id
   order by o.created_at desc,o.id desc limit 31 offset (p_page-1)*30
  ) q;
 else
  select coalesce(jsonb_agg(row order by created_at desc,id desc),'[]'::jsonb) into result from (
   select w.created_at,w.id,jsonb_build_object(
    'id',w.id,'name',coalesce(nullif(p.full_name,''),'—'),'amountCents',w.amount_cents,
    'status',w.status,'createdAt',w.created_at,'sellerId',w.user_id,'transactionType',w.transaction_type,
    'description',w.description,'itemId',w.item_id,'itemName',i.name,'saleMode',i.sale_mode,
    'buyerName',coalesce(nullif(bp.full_name,''),nullif(o.recipient_name,''),'—'),'sellerName',coalesce(nullif(p.full_name,''),'—'),
    'soldBy',case when i.sale_mode='managed_consignment' then 'SHIKIMOMO' when i.sale_mode='peer_to_peer' then coalesce(nullif(p.full_name,''),'—') else null end,
    'orderId',c.order_id,'saleCents',c.sale_cents,'sellerBps',c.seller_bps,
    'sellerCents',c.seller_cents,'platformGrossCents',c.sale_cents-c.seller_cents,
    'platformCouponCents',l.discount_cents,'platformAfterCouponCents',c.sale_cents-c.seller_cents-l.discount_cents,
    'reversedAt',c.reversed_at,'reversalWalletId',c.reversal_wallet_id,
    'bankConfirmation','not_connected') row
   from public.wallet_transactions w left join public.profiles p on p.id=w.user_id
   left join public.items i on i.id=w.item_id
   left join public.order_seller_credits c on c.wallet_id=w.id or c.reversal_wallet_id=w.id
   left join public.order_items l on l.id=c.order_item_id
   left join public.orders o on o.id=c.order_id left join public.profiles bp on bp.id=o.buyer_id
   where (p_kind='payouts' and w.transaction_type='payout_debit')
      or (p_kind='earnings' and w.transaction_type<>'payout_debit')
   order by w.created_at desc,w.id desc limit 31 offset (p_page-1)*30
  ) q;
 end if;
 return result;
end $$;
revoke all on function public.owner_finance_report(text,integer) from public,anon;
grant execute on function public.owner_finance_report(text,integer) to authenticated;
