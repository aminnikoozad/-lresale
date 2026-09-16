-- Force seller pricing approval through the guarded RPCs so callers cannot
-- bypass the expected-price concurrency check with direct column updates.

create or replace function public.approve_item_pricing(target_item_id uuid, expected_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in required';
  end if;
  if expected_price is null or expected_price < 1 or expected_price > 100000000 then
    raise exception 'Invalid expected price';
  end if;

  update public.items
  set seller_pricing_approved_at = now()
  where id = target_item_id
    and owner_id = auth.uid()
    and initial_approved_price_cents = expected_price
    and status in ('accepted','waiting_for_seller_approval')
    and seller_pricing_approved_at is null;

  if not found then
    raise exception 'Pricing changed or item unavailable; refresh and review';
  end if;
end;
$$;

create or replace function public.approve_bundle_pricing(target_bundle_id uuid, expected_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in required';
  end if;
  if expected_price is null or expected_price < 1 or expected_price > 100000000 then
    raise exception 'Invalid expected price';
  end if;

  update public.bundles
  set seller_pricing_approved_at = now(), status = 'approved'
  where id = target_bundle_id
    and owner_id = auth.uid()
    and initial_approved_price_cents = expected_price
    and status = 'waiting_for_seller_approval'
    and seller_pricing_approved_at is null;

  if not found then
    raise exception 'Bundle pricing changed or is unavailable; refresh and review';
  end if;
end;
$$;

revoke execute on function public.approve_item_pricing(uuid,integer) from public, anon;
grant execute on function public.approve_item_pricing(uuid,integer) to authenticated;

revoke execute on function public.approve_bundle_pricing(uuid,integer) from public, anon;
grant execute on function public.approve_bundle_pricing(uuid,integer) to authenticated;

revoke update (seller_pricing_approved_at) on public.items from authenticated;
revoke update (seller_pricing_approved_at, status) on public.bundles from authenticated;
