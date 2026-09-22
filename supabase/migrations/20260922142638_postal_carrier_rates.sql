-- Additive carrier rating foundation. Existing payment and commission logic is unchanged.
create table public.postal_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 origin_postal text not null default '',
 band_limits integer[] not null default array[500,2000,5000,30000],
 revision integer not null default 1,
 check(array_ndims(band_limits)=1 and cardinality(band_limits)=4 and array_lower(band_limits,1)=1 and band_limits[1]>0 and band_limits[2]>band_limits[1] and band_limits[3]>band_limits[2] and band_limits[4]>band_limits[3] and band_limits[4]<=30000 and array_position(band_limits,null) is null),
 check(origin_postal='' or origin_postal ~ '^[ABCEGHJKLMNPRSTVXY][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$'),
 check(not enabled or origin_postal<>'')
);
insert into public.postal_config(singleton) values(true);
create table public.postal_parcels (
 item_id uuid primary key references public.items(id) on delete cascade,
 weight_grams integer not null check(weight_grams between 1 and 100000),
 length_mm integer not null check(length_mm between 1 and 10000),
 width_mm integer not null check(width_mm between 1 and 10000),
 height_mm integer not null check(height_mm between 1 and 10000),
 manual_review boolean not null default true,
 local_only boolean not null default false,
 mailing_tube boolean not null default false,
 unpackaged boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.postal_quote_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null default now(), requests integer not null default 0
);
create table public.postal_quotes (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references auth.users(id) on delete cascade,
 item_ids uuid[] not null, destination text not null, snapshot jsonb not null,
 rates jsonb not null check(jsonb_typeof(rates)='array'),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 order_id uuid references public.orders(id) on delete set null,
 check(cardinality(item_ids) between 1 and 25), check(expires_at>created_at and expires_at<=created_at+interval '15 minutes')
);
create index postal_quotes_buyer_created on public.postal_quotes(buyer_id,created_at desc);
create index postal_quotes_order on public.postal_quotes(order_id) where order_id is not null;
alter table public.postal_config enable row level security;
alter table public.postal_parcels enable row level security;
alter table public.postal_quote_limits enable row level security;
alter table public.postal_quotes enable row level security;
revoke all on public.postal_config,public.postal_parcels,public.postal_quote_limits,public.postal_quotes from public,anon,authenticated;
-- Customers can read only their own carrier results, never insert/alter a price.
grant select on public.postal_quotes to authenticated;
create policy own_postal_quotes on public.postal_quotes for select to authenticated using(buyer_id=(select auth.uid()));
grant select,insert on public.postal_quotes to service_role;

create function public.postal_weight_bands() returns integer[] language sql stable security definer set search_path='' as $$ select band_limits from public.postal_config where singleton $$;
revoke all on function public.postal_weight_bands() from public;
grant execute on function public.postal_weight_bands() to anon,authenticated;

create function public.admin_postal_state() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_admin_permission('shipping');
 if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'MFA required'; end if;
 return jsonb_build_object('config',(select to_jsonb(c) from public.postal_config c where singleton),
 'items',coalesce((select jsonb_agg(x order by x.name) from (select i.id,i.name,i.category,i.status,to_jsonb(p) as parcel from public.items i left join public.postal_parcels p on p.item_id=i.id where i.status not in ('sold','returned') order by i.created_at desc limit 500) x),'[]'::jsonb));
end $$;
create function public.admin_save_postal_config(p_enabled boolean,p_origin text,p_bands integer[]) returns void language plpgsql security definer set search_path='' as $$
declare old jsonb;
begin
 perform private.assert_admin_permission('shipping');
 if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'MFA required'; end if;
 select to_jsonb(c) into old from public.postal_config c where singleton for update;
 update public.postal_config set enabled=p_enabled,origin_postal=upper(regexp_replace(trim(p_origin),'\s','','g')),band_limits=p_bands,revision=revision+1 where singleton;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason) values(auth.uid(),'postal_config_updated','postal_config','singleton',old,(select to_jsonb(c) from public.postal_config c where singleton),'Postal rating configuration');
end $$;
create function public.admin_save_postal_parcel(p_item uuid,p_weight integer,p_length integer,p_width integer,p_height integer,p_manual boolean,p_local boolean,p_tube boolean,p_unpackaged boolean) returns void language plpgsql security definer set search_path='' as $$
declare old jsonb;
begin
 perform private.assert_admin_permission('shipping');
 if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'MFA required'; end if;
 perform 1 from public.items where id=p_item for update;
 if not found then raise exception 'Item not found'; end if;
 select to_jsonb(p) into old from public.postal_parcels p where item_id=p_item;
 insert into public.postal_parcels(item_id,weight_grams,length_mm,width_mm,height_mm,manual_review,local_only,mailing_tube,unpackaged) values(p_item,p_weight,p_length,p_width,p_height,p_manual,p_local,p_tube,p_unpackaged)
 on conflict(item_id) do update set weight_grams=p_weight,length_mm=p_length,width_mm=p_width,height_mm=p_height,manual_review=p_manual,local_only=p_local,mailing_tube=p_tube,unpackaged=p_unpackaged,updated_at=clock_timestamp();
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason) values(auth.uid(),'postal_parcel_updated','item',p_item::text,old,(select to_jsonb(p) from public.postal_parcels p where item_id=p_item),'Verified individually packed parcel');
end $$;
-- Public RPC is authenticated and bounded; only a narrow shipping projection leaves the DB.
create function private.postal_snapshot(p_items uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.postal_config%rowtype; parcels jsonb; n integer;
begin
 select * into c from public.postal_config where singleton;
 if cardinality(p_items) is null or cardinality(p_items) not between 1 and 25 or cardinality(p_items)<>(select count(distinct x) from unnest(p_items) x) then return jsonb_build_object('status','unavailable_items'); end if;
 select count(*) into n from public.items i where i.id=any(p_items) and i.status='listed' and not exists(select 1 from public.inventory_reservations r where r.item_id=i.id and r.status='active' and r.expires_at>now());
 if n<>cardinality(p_items) then return jsonb_build_object('status','unavailable_items'); end if;
 if not c.enabled then return jsonb_build_object('status','not_configured'); end if;
 if not coalesce((select canada_wide_enabled from public.shipping_settings where singleton),false) then return jsonb_build_object('status','disabled'); end if;
 if (select nonlocal_fee_mode from public.shipping_settings where singleton)<>'carrier_quote' then return jsonb_build_object('status','manual_review'); end if;
 -- Existing Home inspection data supplies dimensions when no explicit parcel exists.
 with source as (
 select i.id,p.item_id,
 coalesce(p.weight_grams,ceil((h.staff_data->>'packaged_weight_kg')::numeric*1000)::integer) w,
 coalesce(p.length_mm,ceil((h.staff_data->>'packaged_length_cm')::numeric*10)::integer) l,
 coalesce(p.width_mm,ceil((h.staff_data->>'packaged_width_cm')::numeric*10)::integer) b,
 coalesce(p.height_mm,ceil((h.staff_data->>'packaged_height_cm')::numeric*10)::integer) d,
 coalesce(p.manual_review,false) or coalesce((h.staff_data->>'manual_shipping_review_required')::boolean,false) or coalesce((h.staff_data->>'local_delivery_preferred')::boolean,false) or coalesce((h.public_data->>'oversized')::boolean,false) or coalesce(h.staff_data->>'carrier_restriction','')<>'' or coalesce(h.public_data->>'shipping_restrictions','')<>'' as manual,
 coalesce(p.local_only,false) or coalesce((h.public_data->>'pickup_only')::boolean,false) as local,
 coalesce(p.mailing_tube,false) tube,coalesce(p.unpackaged,false) unpackaged,
 p.updated_at parcel_revision,h.updated_at inspection_revision
 from public.items i left join public.postal_parcels p on p.item_id=i.id left join public.home_item_details h on h.item_id=i.id where i.id=any(p_items)
 ) select jsonb_agg(jsonb_build_object('itemId',id,'weightGrams',w,'lengthMm',l,'widthMm',b,'heightMm',d,'mailingTube',tube,'unpackaged',unpackaged,'band',(select min(j) from generate_subscripts(c.band_limits,1) j where w<=c.band_limits[j]),'ready',not manual and not local and coalesce(w>0 and w<=c.band_limits[4] and l>0 and b>0 and d>0 and greatest(l,b,d)<=2000 and (l+b+d-greatest(l,b,d))*2+greatest(l,b,d)<=3000,false),'parcelRevision',parcel_revision,'inspectionRevision',inspection_revision) order by id) into parcels from source;
 if exists(select 1 from jsonb_array_elements(parcels) p where not (p->>'ready')::boolean) then return jsonb_build_object('status','manual_review'); end if;
 return jsonb_build_object('status','ready','origin',c.origin_postal,'revision',c.revision,'parcels',parcels);
end $$;
revoke all on function private.postal_snapshot(uuid[]) from public,anon,authenticated;
create function public.prepare_postal_quote(p_items uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempts integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.postal_quote_limits(user_id,requests) values(auth.uid(),1) on conflict(user_id) do update set requests=case when public.postal_quote_limits.window_start<now()-interval '1 minute' then 1 else public.postal_quote_limits.requests+1 end,window_start=case when public.postal_quote_limits.window_start<now()-interval '1 minute' then now() else public.postal_quote_limits.window_start end returning requests into attempts;
 if attempts>5 then return jsonb_build_object('status','rate_limited'); end if;
 return private.postal_snapshot(p_items);
end $$;
create function public.create_postal_checkout(p_quote uuid,p_service text,recipient_name text,address_line1 text,address_line2 text,city text,province text,postal_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.postal_quotes%rowtype; rate jsonb; oid uuid; current_snapshot jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into q from public.postal_quotes where id=p_quote and buyer_id=auth.uid() for update;
 if not found then raise exception 'Quote unavailable'; end if;
 if q.order_id is not null then raise exception 'Quote already used'; end if;
 if q.expires_at<=now() or (q.destination is distinct from upper(regexp_replace(trim(postal_code),'\s','','g'))) then raise exception 'Quote expired or address changed'; end if;
 -- Lock inventory to serialize checkout against staff parcel changes and reservations.
 perform id from public.items where id=any(q.item_ids) order by id for update;
 select private.postal_snapshot(q.item_ids) into current_snapshot;
 if current_snapshot<>q.snapshot then raise exception 'Shipping details changed; request a new quote'; end if;
 select r into rate from jsonb_array_elements(q.rates) r where r->>'serviceCode'=p_service;
 if rate is null or (rate->>'totalCents')::integer<0 then raise exception 'Shipping service unavailable'; end if;
 oid:=public.create_checkout_order(q.item_ids,recipient_name,address_line1,address_line2,city,province,postal_code);
 update public.orders set shipping_cents=(rate->>'totalCents')::integer where id=oid;
 update public.postal_quotes set order_id=oid where id=q.id;
 return oid;
end $$;
revoke all on function public.admin_postal_state(),public.admin_save_postal_config(boolean,text,integer[]),public.admin_save_postal_parcel(uuid,integer,integer,integer,integer,boolean,boolean,boolean,boolean),public.prepare_postal_quote(uuid[]),public.create_postal_checkout(uuid,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.admin_postal_state(),public.admin_save_postal_config(boolean,text,integer[]),public.admin_save_postal_parcel(uuid,integer,integer,integer,integer,boolean,boolean,boolean,boolean),public.prepare_postal_quote(uuid[]),public.create_postal_checkout(uuid,text,text,text,text,text,text,text) to authenticated;
