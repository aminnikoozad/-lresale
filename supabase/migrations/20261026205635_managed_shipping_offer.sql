begin;
alter table public.orders add column managed_shipping_original_cents integer check(managed_shipping_original_cents>=0), add column managed_shipping_offer_applied boolean not null default false;
create function private.apply_managed_shipping_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare cheapest integer; eligible boolean;
begin
 if old.status<>'awaiting_payment' or new.status<>'awaiting_payment' or old.payment_status='paid' or new.payment_status='paid' then return new; end if;
 if exists(select 1 from public.order_payment_attempts a where a.order_id=new.id and a.status in ('created','pending','succeeded')) then return new; end if;
 select min((r->>'totalCents')::integer) into cheapest from public.postal_quotes q cross join lateral jsonb_array_elements(q.rates) r where q.order_id=new.id;
 if cheapest is null then return new; end if;
 select exists(select 1 from public.order_items where order_id=new.id) and not exists(select 1 from public.order_items oi join public.items i on i.id=oi.item_id where oi.order_id=new.id and (i.sale_mode is distinct from 'managed_consignment' or i.shipping_responsibility is distinct from 'team' or i.physical_custody is distinct from 'team')) into eligible;
 eligible:=eligible and new.subtotal_cents-coalesce(new.discount_cents,0)>=10000;
 if new.managed_shipping_original_cents is null and eligible and new.shipping_cents=cheapest then new.managed_shipping_original_cents:=new.shipping_cents; end if;
 if new.managed_shipping_original_cents is not null then
  new.managed_shipping_offer_applied:=eligible;
  new.shipping_cents:=case when eligible then 0 else new.managed_shipping_original_cents end;
  if new.shipping_cents is distinct from old.shipping_cents then new.total_cents:=null; end if;
 end if;
 return new;
end $$;
revoke all on function private.apply_managed_shipping_offer() from public,anon,authenticated;
create trigger orders_managed_shipping_offer before update on public.orders for each row execute function private.apply_managed_shipping_offer();
create function private.apply_bound_postal_offer() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.orders set shipping_cents=shipping_cents where id=new.order_id and status='awaiting_payment' and payment_status<>'paid';
 return new;
end $$;
revoke all on function private.apply_bound_postal_offer() from public,anon,authenticated;
create trigger postal_quotes_managed_shipping_offer after update of order_id on public.postal_quotes for each row when (old.order_id is null and new.order_id is not null) execute function private.apply_bound_postal_offer();
commit;
