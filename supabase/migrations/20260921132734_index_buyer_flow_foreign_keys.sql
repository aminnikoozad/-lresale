-- Add covering indexes for buyer-flow foreign keys flagged by the database advisor.
-- These indexes do not change business logic; they reduce join/delete overhead as data grows.

create index if not exists favorites_item_idx
  on public.favorites(item_id);

create index if not exists order_items_item_idx
  on public.order_items(item_id);

create index if not exists price_drop_alerts_item_idx
  on public.price_drop_alerts(item_id);

create index if not exists return_requests_order_idx
  on public.return_requests(order_id);
