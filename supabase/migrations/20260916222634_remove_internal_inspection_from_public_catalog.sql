begin;

drop function if exists public.catalog_item_detail(uuid);

create function public.catalog_item_detail(target_item_id uuid)
returns table(
  item_id uuid,
  name text,
  brand text,
  category text,
  size text,
  item_condition text,
  photo_urls text[],
  description text,
  price_cents integer,
  published_at timestamptz,
  inspected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    i.name,
    coalesce(i.brand,'Unbranded'),
    i.category,
    i.size,
    i.item_condition,
    i.photo_urls,
    i.description,
    coalesce(i.listed_price_cents,i.initial_approved_price_cents),
    i.published_at,
    i.inspected_at
  from public.items i
  where i.id = target_item_id
    and i.status = 'listed'
    and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
  limit 1;
$$;

revoke all on function public.catalog_item_detail(uuid) from public;
grant execute on function public.catalog_item_detail(uuid) to anon, authenticated;

commit;
