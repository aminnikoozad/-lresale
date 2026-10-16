-- Production still has the original pre-discount lower bound (orders_check).
-- Keep a non-negative merchandise lower bound while allowing the approved offer.
alter table public.orders drop constraint if exists orders_check;
alter table public.orders add constraint orders_discounted_subtotal_floor
 check(discount_cents<=subtotal_cents and (total_cents is null or total_cents>=subtotal_cents-discount_cents));

-- Defence in depth for the private, default-disabled connection record.
alter table private.buyer_payment_connection enable row level security;
