-- Forward-only physical receipt and meaningful photo references.
-- Independent of the publication price/inspection guard in PR37; either order is safe.
-- No existing rows are rewritten. A reference is not proof that a photo exists.
begin;
create function private.guard_collection_receipt_state()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status = 'collected' and new.status is distinct from old.status
     and (new.status is null or new.status not in ('inspection','completed')) then
    raise exception 'Received pickup cannot return to a pre-receipt or cancelled state';
  end if;
  if old.status = 'inspection' and new.status is distinct from old.status
     and new.status is distinct from 'completed' then
    raise exception 'Pickup under inspection can only advance to completed';
  end if;
  return new;
end $$;
revoke all on function private.guard_collection_receipt_state() from public,anon,authenticated;
create trigger collection_requests_guard_receipt_state
before update of status on public.collection_requests
for each row execute function private.guard_collection_receipt_state();

create function private.guard_item_photo_references()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(array_ndims(new.photo_urls),1) <> 1
     or exists(select 1 from unnest(new.photo_urls) as photo(url)
               where url is null or url !~ '[^[:space:]]') then
    raise exception 'Photo references must be nonempty text in a one-dimensional array';
  end if;
  if new.status in ('listed','relisted') and coalesce(cardinality(new.photo_urls),0)<1 then
    raise exception 'At least one nonempty photo reference is required before listing';
  end if;
  return new;
end $$;
revoke all on function private.guard_item_photo_references() from public,anon,authenticated;
create trigger items_guard_photo_references
before insert or update of status,photo_urls on public.items
for each row execute function private.guard_item_photo_references();

create or replace function public.expire_prepared_checkouts(p_limit integer default 200)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid batch size'; end if;
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

commit;
