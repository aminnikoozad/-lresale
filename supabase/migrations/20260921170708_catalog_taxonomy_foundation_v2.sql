alter table public.items add column if not exists subcategory text;
alter table public.collection_requests add column if not exists subcategory_hint text;

create or replace function public.is_valid_catalog_subcategory(p_category text, p_subcategory text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'women' then p_subcategory = any(array['Tops','T-Shirts','Shirts & Blouses','Sweaters & Knitwear','Hoodies & Sweatshirts','Dresses','Jumpsuits & Rompers','Skirts','Jeans','Pants & Trousers','Shorts','Jackets','Coats','Blazers','Activewear','Loungewear','Swimwear','Other Women''s Clothing'])
    when 'men' then p_subcategory = any(array['T-Shirts','Shirts','Polos','Sweaters & Knitwear','Hoodies & Sweatshirts','Jeans','Pants & Chinos','Shorts','Jackets','Coats','Blazers & Suits','Activewear','Loungewear','Swimwear','Other Men''s Clothing'])
    when 'kids' then p_subcategory = any(array['Tops & T-Shirts','Shirts & Blouses','Sweaters & Hoodies','Dresses','Pants & Jeans','Shorts','Skirts','Sets & Outfits','Jumpsuits & One-Pieces','Jackets & Coats','Activewear','Sleepwear','Swimwear','Baby Clothing','Other Kids'' Clothing'])
    when 'shoes' then p_subcategory = any(array['Sneakers','Running & Athletic Shoes','Boots','Ankle Boots','Loafers','Flats','Heels','Sandals','Dress Shoes','Slippers','Other Shoes'])
    when 'accessories' then p_subcategory = any(array['Bags & Handbags','Backpacks','Wallets & Card Holders','Belts','Hats & Caps','Scarves & Shawls','Sunglasses & Eyewear','Jewelry','Watches','Hair Accessories','Ties & Bow Ties','Gloves','Other Accessories'])
    when 'electronics' then p_subcategory = any(array['Smartphones','Tablets','Laptops','Desktop Computers','Monitors','Computer Components','Keyboards & Mice','Storage Devices','Gaming Consoles','Gaming Accessories','Headphones & Audio','Smartwatches & Wearables','Cameras & Photography','Networking Devices','Chargers & Cables','Other Electronics'])
    when 'home_decor' then p_subcategory = any(array['Wall Art','Mirrors','Vases','Candle Holders','Decorative Objects','Trays & Decorative Bowls','Small Lamps & Lighting','Clocks','Decorative Tableware','Bookends','Small Home Textiles','Vintage','Collectibles','Other Home Decor'])
    else false
  end;
$$;
revoke all on function public.is_valid_catalog_subcategory(text,text) from public, anon;
grant execute on function public.is_valid_catalog_subcategory(text,text) to authenticated, service_role;

alter table public.items drop constraint if exists items_subcategory_check;
alter table public.items add constraint items_subcategory_check
check (subcategory is null or public.is_valid_catalog_subcategory(category, subcategory));

alter table public.collection_requests drop constraint if exists collection_category;
alter table public.collection_requests add constraint collection_category
check (category in ('clothing','women','men','kids','shoes','accessories','electronics','home_decor'));

alter table public.collection_requests drop constraint if exists collection_requests_subcategory_hint_check;
alter table public.collection_requests add constraint collection_requests_subcategory_hint_check
check (
  subcategory_hint is null
  or (
    category <> 'clothing'
    and public.is_valid_catalog_subcategory(category, subcategory_hint)
  )
);

create index if not exists items_category_subcategory_idx
on public.items(category, subcategory)
where subcategory is not null;

insert into public.home_subcategories(name, active)
values
  ('Wall Art', true),('Mirrors', true),('Vases', true),('Candle Holders', true),
  ('Decorative Objects', true),('Trays & Decorative Bowls', true),('Small Lamps & Lighting', true),
  ('Clocks', true),('Decorative Tableware', true),('Bookends', true),('Small Home Textiles', true),
  ('Vintage', true),('Collectibles', true),('Other Home Decor', true)
on conflict (name) do update set active = excluded.active;

update public.home_subcategories
set active = false
where name not in (
  'Wall Art','Mirrors','Vases','Candle Holders','Decorative Objects','Trays & Decorative Bowls',
  'Small Lamps & Lighting','Clocks','Decorative Tableware','Bookends','Small Home Textiles',
  'Vintage','Collectibles','Other Home Decor'
);

update public.home_item_details
set public_data = jsonb_set(
  public_data,
  '{subcategory}',
  to_jsonb(
    case public_data->>'subcategory'
      when 'Decor' then 'Decorative Objects'
      when 'Trays' then 'Trays & Decorative Bowls'
      when 'Small Lamps' then 'Small Lamps & Lighting'
      when 'Tableware & Decorative Dishes' then 'Decorative Tableware'
      when 'Vintage & Collectibles' then 'Vintage'
      when 'Antiques' then 'Vintage'
      else public_data->>'subcategory'
    end
  ),
  true
)
where public_data ? 'subcategory'
  and public_data->>'subcategory' is not null;

update public.items i
set subcategory = h.public_data->>'subcategory'
from public.home_item_details h
where h.item_id = i.id
  and i.category = 'home_decor'
  and h.public_data ? 'subcategory'
  and public.is_valid_catalog_subcategory('home_decor', h.public_data->>'subcategory');

create or replace function private.sync_home_subcategory_to_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subcategory text;
begin
  v_subcategory := nullif(trim(new.public_data->>'subcategory'), '');
  if v_subcategory is not null and not public.is_valid_catalog_subcategory('home_decor', v_subcategory) then
    raise exception 'Invalid Home & Decor subcategory';
  end if;
  update public.items
     set subcategory = v_subcategory,
         updated_at = now()
   where id = new.item_id
     and category = 'home_decor';
  return new;
end;
$$;
revoke all on function private.sync_home_subcategory_to_item() from public, anon, authenticated;

drop trigger if exists home_item_details_sync_subcategory on public.home_item_details;
create trigger home_item_details_sync_subcategory
after insert or update of public_data on public.home_item_details
for each row execute function private.sync_home_subcategory_to_item();

create or replace function public.admin_create_item_v4(
  target_owner_id uuid,
  target_collection_request_id uuid,
  item_name text,
  item_brand text,
  item_category text,
  item_subcategory text,
  item_size text,
  item_condition text,
  proposed_price_cents integer,
  below_minimum_action text,
  action_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_item_id uuid;
  clean_subcategory text := nullif(trim(coalesce(item_subcategory,'')), '');
begin
  if auth.uid() is null or not public.can_manage_items() then
    raise exception 'Item management permission required';
  end if;
  if clean_subcategory is null or not public.is_valid_catalog_subcategory(item_category, clean_subcategory) then
    raise exception 'Choose a valid subcategory for this category';
  end if;

  created_item_id := public.admin_create_item_v2(
    target_owner_id,target_collection_request_id,item_name,item_brand,item_category,
    item_size,item_condition,proposed_price_cents,below_minimum_action,action_reason
  );

  update public.items
     set subcategory = clean_subcategory,
         updated_at = now()
   where id = created_item_id;

  if item_category = 'home_decor' then
    insert into public.home_item_details(item_id, public_data)
    values(created_item_id, jsonb_build_object('subcategory', clean_subcategory))
    on conflict(item_id) do update
      set public_data = jsonb_set(coalesce(public.home_item_details.public_data,'{}'::jsonb), '{subcategory}', to_jsonb(clean_subcategory), true),
          updated_at = now();
  end if;

  return created_item_id;
end;
$$;
revoke all on function public.admin_create_item_v4(uuid,uuid,text,text,text,text,text,text,integer,text,text) from public, anon;
grant execute on function public.admin_create_item_v4(uuid,uuid,text,text,text,text,text,text,integer,text,text) to authenticated, service_role;

create or replace function public.admin_item_list_v4()
returns table(
  item_id uuid, owner_id uuid, collection_request_id uuid, owner_name text, owner_username text,
  customer_code text, name text, brand text, category text, subcategory text, size text,
  item_condition text, photo_urls text[], status text, initial_price_cents integer,
  listed_price_cents integer, seller_bps integer, platform_bps integer,
  seller_approved_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,i.owner_id,i.collection_request_id,p.full_name,p.username,p.customer_code,
         i.name,i.brand,i.category,i.subcategory,i.size,i.item_condition,i.photo_urls,i.status,
         i.initial_approved_price_cents,i.listed_price_cents,i.locked_seller_commission_bps,
         i.locked_platform_commission_bps,i.seller_pricing_approved_at,i.created_at
  from public.items i
  join public.profiles p on p.id=i.owner_id
  where public.can_manage_items()
  order by i.created_at desc
  limit 2000;
$$;
revoke all on function public.admin_item_list_v4() from public, anon;
grant execute on function public.admin_item_list_v4() to authenticated, service_role;

create or replace function public.catalog_items_v3()
returns table(
  item_id uuid, name text, brand text, category text, subcategory text, size text,
  item_condition text, color text, material text, pattern text, photo_url text,
  price_cents integer, published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.subcategory,i.size,i.item_condition,
         i.color,i.material,i.pattern,
         case when cardinality(i.photo_urls)>0 then i.photo_urls[1] else null end,
         coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at
  from public.items i
  where i.status='listed'
    and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
    and not exists (
      select 1 from public.inventory_reservations r
      where r.item_id=i.id and r.status='active' and r.expires_at>now()
    )
  order by i.published_at desc nulls last,i.created_at desc
  limit 1000;
$$;
revoke all on function public.catalog_items_v3() from public;
grant execute on function public.catalog_items_v3() to anon, authenticated, service_role;

create or replace function public.catalog_item_detail_v3(target_item_id uuid)
returns table(
  item_id uuid, name text, brand text, category text, subcategory text, size text,
  item_condition text, color text, material text, pattern text, condition_notes text,
  photo_urls text[], description text, price_cents integer, published_at timestamptz,
  inspected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,i.name,coalesce(i.brand,'Unbranded'),i.category,i.subcategory,i.size,i.item_condition,
         i.color,i.material,i.pattern,i.condition_notes,i.photo_urls,i.description,
         coalesce(i.listed_price_cents,i.initial_approved_price_cents),i.published_at,i.inspected_at
  from public.items i
  where i.id=target_item_id
    and i.status='listed'
    and coalesce(i.listed_price_cents,i.initial_approved_price_cents) is not null
    and not exists (
      select 1 from public.inventory_reservations r
      where r.item_id=i.id and r.status='active' and r.expires_at>now()
    )
  limit 1;
$$;
revoke all on function public.catalog_item_detail_v3(uuid) from public;
grant execute on function public.catalog_item_detail_v3(uuid) to anon, authenticated, service_role;
