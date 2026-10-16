-- Additive buyer catalog. Apply only after reconciling the real project's migration history.
-- Existing publication times are the only historical evidence available; do not invent earlier dates.
alter table public.items add column first_published_at timestamptz;
update public.items set first_published_at=published_at where published_at is not null;
create function private.keep_first_publication() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.first_published_at is not null then new.first_published_at:=old.first_published_at;
 elsif new.published_at is not null then new.first_published_at:=new.published_at;
 end if;
 if new.first_published_at is not null then new.published_at:=new.first_published_at; end if;
 return new;
end $$;
revoke all on function private.keep_first_publication() from public,anon,authenticated;
create trigger items_keep_first_publication before insert or update of published_at,first_published_at on public.items for each row execute function private.keep_first_publication();

create table public.clothing_listing_evidence (
 item_id uuid primary key references public.items(id) on delete cascade,
 photos jsonb not null check(jsonb_typeof(photos)='array' and jsonb_array_length(photos) between 3 and 8),
 measurements jsonb not null default '{}' check(jsonb_typeof(measurements)='object'),
 disclosed_defects text[] not null default '{}',
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now()
);
alter table public.clothing_listing_evidence enable row level security;
revoke all on public.clothing_listing_evidence from public,anon,authenticated;
create function public.admin_save_clothing_evidence(p_item uuid,p_photos jsonb,p_measurements jsonb,p_defects text[])
returns void language plpgsql security definer set search_path='' as $$
declare i public.items%rowtype; photo jsonb; m record;
begin
 if auth.uid() is null or not public.can_manage_items() or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Item staff with MFA required'; end if;
 select * into i from public.items where id=p_item for update;
 if not found or i.category not in ('women','men','kids') then raise exception 'Clothing item required'; end if;
 if i.status in ('sold','archived','donated') then raise exception 'Evidence is locked'; end if;
 if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 3 and 8 or p_defects is null then raise exception 'Photo evidence required'; end if;
 if (select count(distinct value->>'url') from jsonb_array_elements(p_photos))<>jsonb_array_length(p_photos) then raise exception 'Use distinct photos for the views'; end if;
 foreach photo in array array(select value from jsonb_array_elements(p_photos)) loop
   if photo->>'role' not in ('front','back','size_label','defect','detail') or photo->>'role' is null
      or not (coalesce(photo->>'url','')=any(i.photo_urls)) then raise exception 'Use this item''s uploaded photos'; end if;
   if photo->>'role'='defect' and not (coalesce(photo->>'defect','')=any(p_defects)) then raise exception 'Identify the disclosed defect'; end if;
 end loop;
 if not (select array_agg(distinct value->>'role') @> array['front','back','size_label'] from jsonb_array_elements(p_photos)) then raise exception 'Front, back and size label photos required'; end if;
 if exists(select 1 from unnest(p_defects) d where length(trim(d)) not between 2 and 300 or not exists(select 1 from jsonb_array_elements(p_photos) p where p->>'role'='defect' and p->>'defect'=d)) then raise exception 'Each disclosed defect requires a photo'; end if;
 if jsonb_typeof(p_measurements) is distinct from 'object' then raise exception 'Invalid measurements'; end if;
 for m in select key,value from jsonb_each(p_measurements) loop
  if m.key not in ('chest','waist','hip','length','sleeve','inseam','shoulder') or jsonb_typeof(m.value)<>'number' or (m.value::text)::numeric not between 0.1 and 500 then raise exception 'Invalid measured centimetres'; end if;
 end loop;
 insert into public.clothing_listing_evidence(item_id,photos,measurements,disclosed_defects,recorded_by)
 values(p_item,p_photos,p_measurements,p_defects,auth.uid()) on conflict(item_id) do update set photos=excluded.photos,measurements=excluded.measurements,disclosed_defects=excluded.disclosed_defects,recorded_by=excluded.recorded_by,recorded_at=now();
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'clothing_evidence_saved','item',p_item::text,jsonb_build_object('photos',p_photos,'measurements',p_measurements,'defects',p_defects),'Staff recorded item-specific evidence');
end $$;
revoke all on function public.admin_save_clothing_evidence(uuid,jsonb,jsonb,text[]) from public,anon;
grant execute on function public.admin_save_clothing_evidence(uuid,jsonb,jsonb,text[]) to authenticated;

create function private.require_clothing_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.category in ('women','men','kids') and new.status in ('listed','relisted') and
 (tg_op='INSERT' or old.status not in ('listed','relisted') or old.photo_urls is distinct from new.photo_urls) then
  if not exists(select 1 from public.clothing_listing_evidence e where e.item_id=new.id and not exists(select 1 from jsonb_array_elements(e.photos) p where not (p->>'url'=any(new.photo_urls)))) then raise exception 'Record clothing photos before publication'; end if;
 end if;
 return new;
end $$;
revoke all on function private.require_clothing_evidence() from public,anon,authenticated;
create trigger items_require_clothing_evidence before insert or update of status,photo_urls on public.items for each row execute function private.require_clothing_evidence();

create function public.buyer_catalog_item_detail(target_item_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_array(jsonb_build_object('item_id',i.id,'name',i.name,'brand',coalesce(i.brand,'Unbranded'),'category',i.category,'subcategory',i.subcategory,'size',i.size,'item_condition',i.item_condition,'color',i.color,'material',i.material,'pattern',i.pattern,'condition_notes',i.condition_notes,'photo_urls',i.photo_urls,'description',i.description,'price_cents',coalesce(i.listed_price_cents,i.initial_approved_price_cents),'published_at',i.first_published_at,'inspected_at',i.inspected_at,
 'availability',case when i.status='sold' then 'sold' when i.status='reserved' or exists(select 1 from public.inventory_reservations r where r.item_id=i.id and r.status='active' and r.expires_at>now()) then 'reserved' else 'available' end,
 'clothing_photos',e.photos,'measurements',e.measurements,'disclosed_defects',e.disclosed_defects))
 from public.items i left join public.clothing_listing_evidence e on e.item_id=i.id
 where i.id=target_item_id and i.status in ('listed','reserved','sold') and i.first_published_at is not null and cardinality(i.photo_urls)>0;
$$;
revoke all on function public.buyer_catalog_item_detail(uuid) from public;
grant execute on function public.buyer_catalog_item_detail(uuid) to anon,authenticated;
