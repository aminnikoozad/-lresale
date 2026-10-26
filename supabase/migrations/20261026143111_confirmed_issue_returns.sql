-- Apply prospectively: historical orders and existing return decisions are unchanged.
begin;
update private.checkout_policy_versions
set return_policy_version = '2026-10-26', updated_at = now()
where singleton;

drop policy if exists return_requests_insert_own on public.return_requests;
create policy return_requests_insert_own on public.return_requests
for insert to authenticated
with check (
  (select auth.uid()) = buyer_id
  and status = 'submitted'
  and exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = return_requests.order_item_id
      and oi.order_id = return_requests.order_id
      and o.buyer_id = (select auth.uid())
      and o.status = 'delivered' and o.payment_status = 'paid'
      and (
        o.return_policy_version is null or o.return_policy_version < '2026-10-26'
        or (
          nullif(btrim(return_requests.details), '') is not null
          and (
            -- Legal claims remain reviewable after the ordinary reporting window.
            return_requests.reason = 'other'
            or (
              return_requests.reason in ('not_as_described','damaged','wrong_item')
              and o.delivered_at is not null
              and o.delivered_at <= now()
              and now() <= o.delivered_at + interval '7 days'
            )
          )
        )
      )
  )
);
commit;
