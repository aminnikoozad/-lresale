-- Apply after schema.sql. Prices are item-only cents, excluding buyer charges.
alter table public.items
  add column initial_approved_price_cents integer check (initial_approved_price_cents between 2500 and 100000000),
  add column locked_seller_commission_bps integer,
  add column locked_platform_commission_bps integer,
  add column seller_pricing_approved_at timestamptz,
  add column estimated_seller_earnings_cents integer generated always as
    (round(listed_price_cents::numeric * locked_seller_commission_bps / 10000)::integer) stored,
  add column final_seller_earnings_cents integer generated always as
    (round(sold_price_cents::numeric * locked_seller_commission_bps / 10000)::integer) stored,
  add column final_platform_earnings_cents integer generated always as
    (sold_price_cents - round(sold_price_cents::numeric * locked_seller_commission_bps / 10000)::integer) stored;

create function private.guard_item_commission() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and old.seller_pricing_approved_at is not null then
    if (new.initial_approved_price_cents, new.locked_seller_commission_bps,
        new.locked_platform_commission_bps, new.seller_pricing_approved_at, new.owner_id)
      is distinct from
       (old.initial_approved_price_cents, old.locked_seller_commission_bps,
        old.locked_platform_commission_bps, old.seller_pricing_approved_at, old.owner_id) then
      raise exception 'Approved pricing and commission are permanently locked';
    end if;
  elsif new.seller_pricing_approved_at is not null then
    if auth.uid() is null or auth.uid() <> new.owner_id or new.status <> 'accepted'
       or new.initial_approved_price_cents is null then
      raise exception 'Only the seller may approve accepted item pricing';
    end if;
    new.seller_pricing_approved_at := now();
    new.locked_seller_commission_bps := case
      when new.initial_approved_price_cents < 10000 then 4500
      when new.initial_approved_price_cents < 25000 then 5000
      when new.initial_approved_price_cents < 50000 then 5500 else 6500 end;
    new.locked_platform_commission_bps := 10000 - new.locked_seller_commission_bps;
    new.listed_price_cents := new.initial_approved_price_cents;
  else
    new.locked_seller_commission_bps := null;
    new.locked_platform_commission_bps := null;
  end if;
  if (new.status in ('listed','sold','auctioned') or new.sold_price_cents is not null)
     and new.seller_pricing_approved_at is null then
    raise exception 'Seller pricing approval is required before publishing or sale';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_item_commission() from public, anon, authenticated;
create trigger items_guard_commission before insert or update on public.items
for each row execute function private.guard_item_commission();

grant update (seller_pricing_approved_at) on public.items to authenticated;
create policy items_approve_own on public.items for update to authenticated
using ((select auth.uid()) = owner_id and status = 'accepted' and seller_pricing_approved_at is null)
with check ((select auth.uid()) = owner_id and status = 'accepted');

create function public.approve_item_pricing(target_item_id uuid, expected_price integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.items set seller_pricing_approved_at = now()
  where id = target_item_id and owner_id = auth.uid()
    and initial_approved_price_cents = expected_price
    and status = 'accepted' and seller_pricing_approved_at is null;
  if not found then raise exception 'Pricing changed or item unavailable; refresh and review'; end if;
end;
$$;
revoke all on function public.approve_item_pricing(uuid,integer) from public, anon;
grant execute on function public.approve_item_pricing(uuid,integer) to authenticated;
