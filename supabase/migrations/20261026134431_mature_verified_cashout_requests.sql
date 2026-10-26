-- A verified sale may be requested after its private 30-day hold expires.
-- Pending bank settlement is not a reason to prevent joining the review queue.
-- Source payment/manual-sale proof is still mandatory; payout completion stays gated.
begin;
create or replace function private.managed_available_credits(p_user uuid)
returns table(wallet_id uuid,batch_id uuid,available integer,cycle_complete boolean)
language sql stable security definer set search_path='' as $$
 select w.id,i.collection_request_id,
  greatest(0,w.amount_cents-coalesce((select sum(a.gross_cents)::integer from private.managed_cashout_allocations a join private.managed_cashouts r on r.id=a.request_id where a.wallet_id=w.id and r.status in ('requested','paid')),0)),
  release.available_at<=now() and exists(select 1 from public.collection_requests b where b.id=i.collection_request_id and b.user_id=p_user)
 from public.wallet_transactions w join public.items i on i.id=w.item_id join private.managed_sale_releases release on release.wallet_id=w.id
 where w.user_id=p_user and i.owner_id=p_user and w.sale_mode='managed_consignment' and i.sale_mode='managed_consignment'
 and w.transaction_type='sale_credit' and w.status in ('pending','completed') and w.commission_snapshot->>'settlementBasis'='cashout_v1'
 and (exists(select 1 from public.item_sale_records s where s.wallet_id=w.id and s.item_id=i.id and s.seller_id=p_user and s.seller_cents=w.amount_cents and s.seller_bps=10000 and s.sale_cents=w.amount_cents)
 or exists(select 1 from public.order_seller_credits c join public.orders o on o.id=c.order_id join public.order_items oi on oi.id=c.order_item_id where c.wallet_id=w.id and c.item_id=i.id and c.seller_id=p_user and c.sale_mode='managed_consignment' and c.seller_cents=w.amount_cents and c.seller_bps=10000 and c.sale_cents=w.amount_cents and c.reversed_at is null and o.payment_status='paid' and o.paid_at is not null));
$$;
revoke all on function private.managed_available_credits(uuid) from public,anon,authenticated,service_role;

commit;
