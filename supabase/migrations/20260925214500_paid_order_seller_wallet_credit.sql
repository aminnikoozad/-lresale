-- Automatic seller bookkeeping for paid marketplace orders.
-- This credits the seller's Rewear wallet; it does NOT initiate a bank payout.
create table if not exists public.order_seller_credits (
  order_item_id uuid primary key references public.order_items(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  wallet_id uuid not null unique references public.wallet_transactions(id) on delete restrict,
  sale_cents integer not null check (sale_cents > 0),
  seller_bps integer not null check (seller_bps between 0 and 10000),
  seller_cents integer not null check (seller_cents > 0),
  reversal_wallet_id uuid unique references public.wallet_transactions(id) on delete restrict,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, item_id)
);

create index if not exists order_seller_credits_seller_idx
  on public.order_seller_credits(seller_id, created_at desc);
create index if not exists order_seller_credits_order_idx
  on public.order_seller_credits(order_id);

alter table public.order_seller_credits enable row level security;
revoke all on table public.order_seller_credits from public, anon, authenticated;

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
             final_platform_earnings_cents = line.unit_price_cents - seller_credit
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

revoke all on function private.sync_paid_order_seller_wallets() from public, anon, authenticated;

drop trigger if exists orders_sync_seller_wallets on public.orders;
create trigger orders_sync_seller_wallets
after update of payment_status on public.orders
for each row
when (old.payment_status is distinct from new.payment_status)
execute function private.sync_paid_order_seller_wallets();
