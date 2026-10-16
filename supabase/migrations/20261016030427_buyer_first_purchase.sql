-- Platform-funded first purchase offer. Seller base prices / commission locks remain untouched.
create table public.buyer_offer_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 percent_bps integer not null default 1000 check(percent_bps between 1 and 10000),
 minimum_cents integer not null default 6000 check(minimum_cents between 800 and 10000000),
 cap_cents integer not null default 800 check(cap_cents between 1 and 100000),
 version integer not null default 1, funding text not null default 'platform' check(funding='platform'),
 updated_at timestamptz not null default now()
);
insert into public.buyer_offer_settings(id) values(true);
create table public.buyer_offer_codes (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null unique references auth.users(id),
 code text not null unique default ('SM-'||upper(replace(gen_random_uuid()::text,'-',''))),
 disabled boolean not null default false, issued_at timestamptz not null default now(),
 used_order_id uuid unique references public.orders(id), used_at timestamptz
);
alter table public.orders add column discount_cents integer not null default 0 check(discount_cents>=0),
 add column buyer_offer_code_id uuid references public.buyer_offer_codes(id), add column buyer_offer_snapshot jsonb;
alter table public.order_items add column discount_cents integer not null default 0 check(discount_cents>=0 and (discount_cents=0 or unit_price_cents-discount_cents>=800));
alter table public.orders drop constraint if exists orders_total_components_check;
alter table public.orders add constraint orders_total_components_check check(total_cents is null or total_cents=subtotal_cents-discount_cents+coalesce(shipping_cents,0)+coalesce(tax_cents,0));
create index orders_buyer_offer_idx on public.orders(buyer_offer_code_id) where buyer_offer_code_id is not null;
create index orders_successful_buyer_idx on public.orders(buyer_id) where paid_at is not null;
alter table public.buyer_offer_settings enable row level security;
alter table public.buyer_offer_codes enable row level security;
revoke all on public.buyer_offer_settings,public.buyer_offer_codes from public,anon,authenticated;

create function private.assert_buyer_sales_admin() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_manage_selling_rules() or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Sales administrator with MFA required'; end if;
end $$;
revoke all on function private.assert_buyer_sales_admin() from public,anon,authenticated;

create function public.admin_buyer_offer_state() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_buyer_sales_admin();
 return jsonb_build_object('settings',(select to_jsonb(s) from public.buyer_offer_settings s where id),
 'codes',coalesce((select jsonb_agg(x) from (select id,buyer_id,code,disabled,issued_at,used_order_id,used_at from public.buyer_offer_codes order by issued_at desc limit 100) x),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(x) from (select action,new_value,created_at from public.audit_logs where entity_type='buyer_offer' order by created_at desc limit 30) x),'[]'::jsonb));
end $$;
revoke all on function public.admin_buyer_offer_state() from public,anon;
grant execute on function public.admin_buyer_offer_state() to authenticated;
create function public.admin_save_buyer_offer(p_enabled boolean,p_bps integer,p_minimum integer,p_cap integer,p_expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare prior public.buyer_offer_settings%rowtype;
begin
 perform private.assert_buyer_sales_admin();
 select * into prior from public.buyer_offer_settings where id for update;
 if prior.version is distinct from p_expected_version then raise exception 'Settings changed; reload'; end if;
 update public.buyer_offer_settings set enabled=p_enabled,percent_bps=p_bps,minimum_cents=p_minimum,cap_cents=p_cap,version=version+1,updated_at=now() where id;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,previous_value,new_value,reason) values(auth.uid(),'buyer_offer_settings_updated','buyer_offer','first_purchase',to_jsonb(prior),jsonb_build_object('enabled',p_enabled,'percent_bps',p_bps,'minimum_cents',p_minimum,'cap_cents',p_cap,'funding','platform'),'Owner-approved platform-funded offer; old order snapshots preserved');
end $$;
revoke all on function public.admin_save_buyer_offer(boolean,integer,integer,integer,integer) from public,anon;
grant execute on function public.admin_save_buyer_offer(boolean,integer,integer,integer,integer) to authenticated;
create function public.admin_disable_buyer_code(p_code uuid,p_disabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_buyer_sales_admin();
 update public.buyer_offer_codes set disabled=p_disabled where id=p_code;
 if not found then raise exception 'Code unavailable'; end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(auth.uid(),'buyer_offer_code_updated','buyer_offer',p_code::text,jsonb_build_object('disabled',p_disabled),'Individual code access changed');
end $$;
revoke all on function public.admin_disable_buyer_code(uuid,boolean) from public,anon;
grant execute on function public.admin_disable_buyer_code(uuid,boolean) to authenticated;

-- Distribute proportionally by available room above $8, with deterministic cent rounding.
create function private.buyer_discount_lines(p_prices integer[],p_bps integer,p_min integer,p_cap integer)
returns integer[] language plpgsql immutable set search_path='' as $$
declare subtotal bigint; room bigint; amount integer; remaining integer; share integer; result integer[]='{}'; price integer; idx integer=0;
begin
 if cardinality(p_prices) not between 1 and 25 or exists(select 1 from unnest(p_prices) p where p is null or p<800) then raise exception 'Invalid offer prices'; end if;
 select sum(p),sum(p-800) into subtotal,room from unnest(p_prices) p;
 amount:=case when subtotal>=p_min then least(floor(subtotal::numeric*p_bps/10000),p_cap,room)::integer else 0 end;
 remaining:=amount;
 foreach price in array p_prices loop
  share:=case when room>0 then floor(amount::numeric*(price-800)/room)::integer else 0 end;
  result:=array_append(result,share); remaining:=remaining-share;
 end loop;
 while remaining>0 loop
  idx:=idx%cardinality(p_prices)+1;
  if result[idx]<p_prices[idx]-800 then result[idx]:=result[idx]+1; remaining:=remaining-1; end if;
 end loop;
 return result;
end $$;
revoke all on function private.buyer_discount_lines(integer[],integer,integer,integer) from public,anon,authenticated;

create function public.my_first_purchase_offer(p_items uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.buyer_offer_settings%rowtype; c public.buyer_offer_codes%rowtype; prices integer[]; discounts integer[];
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,137));
 select * into s from public.buyer_offer_settings where id;
 if not s.enabled or exists(select 1 from public.orders where buyer_id=auth.uid() and paid_at is not null) then return null; end if;
 insert into public.buyer_offer_codes(buyer_id) values(auth.uid()) on conflict(buyer_id) do nothing;
 select * into c from public.buyer_offer_codes where buyer_id=auth.uid();
 if c.disabled or c.used_at is not null then return null; end if;
 if cardinality(p_items) not between 1 and 25 or cardinality(p_items)<>(select count(distinct x) from unnest(p_items) x) then raise exception 'Invalid cart'; end if;
 select array_agg(p.price_cents order by p.item_id) into prices from public.catalog_items_v3() p where p.item_id=any(p_items);
 if cardinality(prices) is distinct from cardinality(p_items) then raise exception 'Cart changed'; end if;
 discounts:=private.buyer_discount_lines(prices,s.percent_bps,s.minimum_cents,s.cap_cents);
 return jsonb_build_object('code',c.code,'percentBps',s.percent_bps,'minimumCents',s.minimum_cents,'capCents',s.cap_cents,'discountCents',(select coalesce(sum(x),0) from unnest(discounts) x),'version',s.version);
end $$;
revoke all on function public.my_first_purchase_offer(uuid[]) from public,anon;
grant execute on function public.my_first_purchase_offer(uuid[]) to authenticated;

create function public.prepare_buyer_checkout(
 p_items uuid[],p_quote uuid,p_service text,p_recipient_name text,p_address_line1 text,p_address_line2 text,p_city text,p_province text,p_postal_code text,p_terms_version text,p_return_policy_version text,p_privacy_notice_version text,p_discount_code text
) returns uuid language plpgsql security definer set search_path='' as $$
declare oid uuid; c public.buyer_offer_codes%rowtype; s public.buyer_offer_settings%rowtype; prices integer[]; discounts integer[]; line record; idx integer=0; amount integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,137));
 select * into s from public.buyer_offer_settings where id for share;
 if not s.enabled or exists(select 1 from public.orders where buyer_id=auth.uid() and paid_at is not null) then raise exception 'First purchase offer unavailable'; end if;
 select * into c from public.buyer_offer_codes where buyer_id=auth.uid() and code=p_discount_code for update;
 if not found or c.disabled or c.used_at is not null then raise exception 'Offer unavailable'; end if;
 if exists(select 1 from public.orders o where o.buyer_offer_code_id=c.id and o.status='awaiting_payment' and (o.reservation_expires_at>now() or exists(select 1 from public.order_payment_attempts a where a.order_id=o.id and a.status in ('created','pending','succeeded')))) then raise exception 'Offer already reserved by another checkout'; end if;
 oid:=public.prepare_checkout_with_terms(p_items,p_quote,p_service,p_recipient_name,p_address_line1,p_address_line2,p_city,p_province,p_postal_code,p_terms_version,p_return_policy_version,p_privacy_notice_version);
 select array_agg(unit_price_cents order by id) into prices from public.order_items where order_id=oid;
 discounts:=private.buyer_discount_lines(prices,s.percent_bps,s.minimum_cents,s.cap_cents);
 select sum(x) into amount from unnest(discounts) x;
 if amount<=0 then raise exception 'Cart does not qualify for a discount'; end if;
 for line in select id from public.order_items where order_id=oid order by id loop idx:=idx+1;update public.order_items set discount_cents=discounts[idx] where id=line.id;end loop;
 update public.orders set discount_cents=amount,buyer_offer_code_id=c.id,buyer_offer_snapshot=jsonb_build_object('version',s.version,'percent_bps',s.percent_bps,'minimum_cents',s.minimum_cents,'cap_cents',s.cap_cents,'funding','platform','code',c.code),total_cents=null where id=oid;
 return oid;
end $$;
revoke all on function public.prepare_buyer_checkout(uuid[],uuid,text,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.prepare_buyer_checkout(uuid[],uuid,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- A successful first purchase consumes the code once. Cancellation/expiry/failure do not.
-- No return/refund entitlement restoration policy is assumed here.
create function private.finalize_first_purchase_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.buyer_offer_codes%rowtype;
begin
 if new.payment_status='paid' and old.payment_status is distinct from 'paid' then
  perform pg_advisory_xact_lock(hashtextextended(new.buyer_id::text,137));
  if new.buyer_offer_code_id is not null then
   select * into c from public.buyer_offer_codes where id=new.buyer_offer_code_id for update;
   if not found or c.buyer_id<>new.buyer_id or c.disabled or c.used_at is not null or exists(select 1 from public.orders where buyer_id=new.buyer_id and paid_at is not null and id<>new.id) then raise exception 'Offer is not eligible'; end if;
   if not (select enabled from public.buyer_offer_settings where id) then raise exception 'Offer disabled'; end if;
   if new.discount_cents<>(select coalesce(sum(discount_cents),0) from public.order_items where order_id=new.id) then raise exception 'Discount total mismatch'; end if;
   update public.buyer_offer_codes set used_order_id=new.id,used_at=now() where id=c.id;
  elsif new.discount_cents<>0 then raise exception 'Unrecognized discount';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.finalize_first_purchase_offer() from public,anon,authenticated;
create trigger orders_finalize_first_purchase_offer before update of payment_status on public.orders for each row execute function private.finalize_first_purchase_offer();
