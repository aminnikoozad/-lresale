-- Staff can inspect paid orders and progress fulfilment. Neither RPC can mark a payment paid or issue a refund.
create function public.admin_order_queue(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.assert_admin_permission('shipping');
  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'MFA required'; end if;
  if p_limit not between 1 and 100 then raise exception 'Invalid limit'; end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select o.id,o.buyer_id,u.email as buyer_email,o.status,o.payment_status,
      o.subtotal_cents,o.shipping_cents,o.tax_cents,o.total_cents,
      o.recipient_name,o.address_line1,o.address_line2,o.city,o.province,o.postal_code,
      o.tracking_number,o.reservation_expires_at,o.created_at,
      (select coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.item_name,'priceCents',oi.unit_price_cents)),'[]'::jsonb)
       from public.order_items oi where oi.order_id=o.id) as items,
      (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'itemId',r.order_item_id,'reason',r.reason,'status',r.status)),'[]'::jsonb)
       from public.return_requests r where r.order_id=o.id) as returns
    from public.orders o join auth.users u on u.id=o.buyer_id
    order by o.created_at desc limit p_limit
  ) x),'[]'::jsonb);
end $$;
revoke all on function public.admin_order_queue(integer) from public,anon;
grant execute on function public.admin_order_queue(integer) to authenticated;

create function public.admin_progress_order(p_order uuid,p_next_status text,p_tracking_number text default null)
returns void language plpgsql security definer set search_path='' as $$
declare old_order public.orders%rowtype; next_tracking text;
begin
  perform private.assert_admin_permission('shipping');
  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'MFA required'; end if;
  select * into old_order from public.orders where id=p_order for update;
  if not found then raise exception 'Order unavailable'; end if;
  if old_order.payment_status<>'paid' or old_order.paid_at is null then raise exception 'Verified payment required'; end if;
  if not ((old_order.status='paid' and p_next_status='processing')
       or (old_order.status='processing' and p_next_status='shipped')
       or (old_order.status='shipped' and p_next_status='delivered'))
  then raise exception 'Invalid fulfilment transition'; end if;
  next_tracking:=nullif(trim(p_tracking_number),'');
  if p_next_status='shipped' and (next_tracking is null or length(next_tracking) not between 5 and 80)
  then raise exception 'A valid carrier tracking reference is required'; end if;
  update public.orders set status=p_next_status,
    tracking_number=case when p_next_status='shipped' then next_tracking else tracking_number end,
    updated_at=now() where id=p_order;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values(auth.uid(),'order_fulfilment_updated','order',p_order::text,
    jsonb_build_object('status',old_order.status),jsonb_build_object('status',p_next_status,'tracking',next_tracking),
    'Staff fulfilment update after verified payment');
end $$;
revoke all on function public.admin_progress_order(uuid,text,text) from public,anon;
grant execute on function public.admin_progress_order(uuid,text,text) to authenticated;

create function public.admin_review_return(p_return uuid,p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare claim public.return_requests%rowtype;
begin
  if auth.jwt()->>'aal' is distinct from 'aal2'
     or not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin'))
  then raise exception 'Owner/Admin with MFA required'; end if;
  select * into claim from public.return_requests where id=p_return for update;
  if not found then raise exception 'Return request unavailable'; end if;
  if not ((claim.status='submitted' and p_decision='reviewing')
       or (claim.status='reviewing' and p_decision in ('approved','denied')))
  then raise exception 'Invalid return review transition'; end if;
  update public.return_requests set status=p_decision,updated_at=now() where id=p_return;
  insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason)
  values(auth.uid(),'return_review_updated','return',p_return::text,
    jsonb_build_object('status',claim.status),jsonb_build_object('status',p_decision),
    'Review only; no refund or seller credit adjustment executed');
end $$;
revoke all on function public.admin_review_return(uuid,text) from public,anon;
grant execute on function public.admin_review_return(uuid,text) to authenticated;
