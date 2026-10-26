-- Separate accounting sources. Never recalculate a sale's commission at cash-out.
alter table public.wallet_transactions
 add column sale_mode text check(sale_mode in ('managed_consignment','peer_to_peer')),
 add column commission_snapshot jsonb;
update public.wallet_transactions w set sale_mode=i.sale_mode,
 commission_snapshot=case when i.sale_mode='managed_consignment' then jsonb_build_object('saleMode',i.sale_mode,'ruleVersion',i.locked_commission_rule_version,'sellerBps',i.locked_seller_commission_bps,'platformBps',i.locked_platform_commission_bps) end
from public.items i where i.id=w.item_id;
-- Historical pickup fees belong only to the managed service. Other unlinked
-- history remains unallocated; it must never become a withdrawable sale balance.
update public.wallet_transactions set sale_mode='managed_consignment' where sale_mode is null and transaction_type='missed_pickup_fee';
create index wallet_seller_mode_idx on public.wallet_transactions(user_id,sale_mode,status);

create function private.guard_wallet_sale_mode() returns trigger language plpgsql security definer set search_path='' as $$
declare i public.items%rowtype;
begin
 if tg_op='UPDATE' then
  if (new.user_id,new.item_id,new.sale_mode,new.commission_snapshot,new.amount_cents,new.transaction_type)
     is distinct from (old.user_id,old.item_id,old.sale_mode,old.commission_snapshot,old.amount_cents,old.transaction_type) then
   raise exception 'Ledger source, amount and commission snapshot are immutable; use a reversal';
  end if;
  if new.status='completed' and old.status<>'completed' and new.transaction_type='payout_debit' then
   raise exception 'Payouts require a verified payout provider';
  end if;
  return new;
 end if;
 if new.item_id is not null then
  select * into i from public.items where id=new.item_id;
  if i.id is null or (new.sale_mode is not null and new.sale_mode<>i.sale_mode) then raise exception 'Ledger sale mode mismatch';end if;
  new.sale_mode:=i.sale_mode;
  if i.sale_mode='managed_consignment' then
   new.commission_snapshot:=jsonb_build_object('saleMode',i.sale_mode,'ruleVersion',i.locked_commission_rule_version,'sellerBps',i.locked_seller_commission_bps,'platformBps',i.locked_platform_commission_bps);
  end if;
 end if;
 if new.transaction_type='missed_pickup_fee' then
  if new.sale_mode is not null and new.sale_mode<>'managed_consignment' then raise exception 'Pickup fees belong to managed selling only';end if;
  new.sale_mode:='managed_consignment';
 end if;
 if new.transaction_type='sale_credit' then
  if i.id is null or i.owner_id<>new.user_id or new.amount_cents<=0 then raise exception 'Sale credit requires its economic owner and item';end if;
  if i.sale_mode='peer_to_peer' then raise exception 'Direct sale settlement requires its own verified payment pipeline';end if;
  if i.locked_seller_commission_bps is null then raise exception 'Managed commission snapshot required';end if;
 end if;
 if new.transaction_type='payout_debit' then
  if new.sale_mode is null or new.amount_cents>=0 then raise exception 'Choose exactly one selling balance for a payout';end if;
  -- The current provider is not connected. Never fabricate a completed transfer.
  raise exception 'Payouts require a verified payout provider';
 end if;
 return new;
end$$;
revoke all on function private.guard_wallet_sale_mode() from public,anon,authenticated;
create trigger wallet_sale_mode_guard before insert or update on public.wallet_transactions for each row execute function private.guard_wallet_sale_mode();

-- Current managed credits must never settle a personal listing using managed rates.
alter table public.order_seller_credits add column sale_mode text not null default 'managed_consignment' check(sale_mode in ('managed_consignment','peer_to_peer'));
create function private.guard_order_credit_sale_mode() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.items i join public.wallet_transactions w on w.id=new.wallet_id where i.id=new.item_id and i.owner_id=new.seller_id and i.sale_mode=new.sale_mode and w.sale_mode=new.sale_mode and w.user_id=new.seller_id and w.item_id=i.id) then raise exception 'Order credit and wallet must have the same seller and selling mode';end if;
 if tg_op='UPDATE' and (new.sale_mode,new.seller_id,new.item_id,new.wallet_id,new.seller_cents,new.seller_bps,new.sale_cents) is distinct from (old.sale_mode,old.seller_id,old.item_id,old.wallet_id,old.seller_cents,old.seller_bps,old.sale_cents) then raise exception 'Order credit source is immutable';end if;
 return new;end$$;
revoke all on function private.guard_order_credit_sale_mode() from public,anon,authenticated;
create trigger order_credit_sale_mode_guard before insert or update on public.order_seller_credits for each row execute function private.guard_order_credit_sale_mode();

create function public.my_seller_balances() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();result jsonb;
begin
 select jsonb_object_agg(x.mode,jsonb_build_object('pending',x.pending,'confirmed',x.confirmed,'earned',x.earned)) into result from (
 select m.mode,coalesce(sum(w.amount_cents) filter(where w.status='pending' and w.transaction_type='sale_credit'),0) as pending,
 coalesce(sum(w.amount_cents) filter(where w.status='completed'),0) as confirmed,coalesce(sum(w.amount_cents) filter(where w.status='completed' and w.transaction_type='sale_credit'),0) as earned
 from (values('managed_consignment'),('peer_to_peer')) m(mode)
 left join public.wallet_transactions w on w.user_id=u and w.sale_mode=m.mode and w.transaction_type in ('sale_credit','adjustment','payout_debit','missed_pickup_fee')
 group by m.mode)x;
 return result||jsonb_build_object('unallocated',(select count(*) from public.wallet_transactions where user_id=u and sale_mode is null and status<>'reversed' and transaction_type in ('sale_credit','adjustment','payout_debit','missed_pickup_fee')));
end$$;
revoke all on function public.my_seller_balances() from public,anon;
grant execute on function public.my_seller_balances() to authenticated;

create function public.admin_customer_ledger_modes(p_customer uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not public.can_manage_items() or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'MFA and item management permission required';end if;
 return coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at desc) from (select id,amount_cents,status,description,created_at,sale_mode,commission_snapshot from public.wallet_transactions where user_id=p_customer order by created_at desc limit 100)w),'[]');
end$$;
revoke all on function public.admin_customer_ledger_modes(uuid) from public,anon;
grant execute on function public.admin_customer_ledger_modes(uuid) to authenticated;

-- Public browsing is separate from transactional inventory. This intentionally
-- preserves all existing payment, inspection and managed-pricing guards.
create table private.direct_listing_publications(
 item_id uuid primary key references public.items(id),owner_id uuid not null references auth.users(id),
 listing_version integer not null,active boolean not null default true,
 consent_version text not null check(consent_version='public-listing-v1'),published_at timestamptz not null default now()
);
alter table private.direct_listing_publications enable row level security;
revoke all on private.direct_listing_publications from public,anon,authenticated;
create function private.direct_listing_visible(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.direct_listing_publications p join public.items i on i.id=p.item_id and i.owner_id=p.owner_id and i.listing_version=p.listing_version
 join private.marketplace_listing_reviews r on r.item_id=i.id and r.listing_version=i.listing_version and r.status='approved'
 join private.marketplace_sellers s on s.user_id=i.owner_id
 join public.clothing_listing_evidence e on e.item_id=i.id and e.listing_version=i.listing_version and e.evidence_source='seller'
 where i.id=p_item and p.active and i.sale_mode='peer_to_peer' and i.status='listing_preparation'
 and not s.vacation and lower(s.city) in ('montréal','montreal') and i.listed_price_cents>=800 and private.pilot_category_active(i.category)
 and exists(select 1 from private.marketplace_photo_assets a where a.item_id=i.id and a.withdrawn_at is null and a.provider='supabase'));
$$;
revoke all on function private.direct_listing_visible(uuid) from public,anon,authenticated;

create function public.set_direct_listing_publication(p_item uuid,p_version integer,p_publish boolean,p_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();i public.items%rowtype;
begin
 select * into i from public.items where id=p_item and owner_id=u and sale_mode='peer_to_peer' for update;
 if i.id is null or i.listing_version<>p_version or p_publish is null then raise exception 'Listing changed';end if;
 if p_publish then
  if p_consent is distinct from true then raise exception 'Confirm public display of this listing and photos';end if;
  if i.status<>'listing_preparation' or i.listed_price_cents is null or i.listed_price_cents<800 or not exists(select 1 from private.marketplace_listing_reviews where item_id=i.id and listing_version=i.listing_version and status='approved') then raise exception 'Current content approval and a valid clothing price are required';end if;
  if not exists(select 1 from private.marketplace_sellers where user_id=u and not vacation and lower(city) in ('montréal','montreal')) then raise exception 'Set up an active Montreal seller profile';end if;
  insert into private.direct_listing_publications(item_id,owner_id,listing_version,consent_version) values(i.id,u,i.listing_version,'public-listing-v1')
   on conflict(item_id) do update set listing_version=excluded.listing_version,active=true,published_at=now(),consent_version=excluded.consent_version;
  if not private.direct_listing_visible(i.id) then raise exception 'Photos, disclosures or current review are incomplete';end if;
 else update private.direct_listing_publications set active=false where item_id=i.id and owner_id=u;end if;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value,reason) values(u,'marketplace.publication_changed','item',i.id::text,jsonb_build_object('version',i.listing_version,'public',p_publish,'consentVersion','public-listing-v1'),'Owner requested public browsing only; payments and payouts remain closed');
end$$;
revoke all on function public.set_direct_listing_publication(uuid,integer,boolean,boolean) from public,anon;
grant execute on function public.set_direct_listing_publication(uuid,integer,boolean,boolean) to authenticated;

create function public.my_direct_publications() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.item_id,'visible',private.direct_listing_visible(p.item_id))) from private.direct_listing_publications p where owner_id=auth.uid()),'[]');end$$;
revoke all on function public.my_direct_publications() from public,anon;
grant execute on function public.my_direct_publications() to authenticated;

create function public.direct_catalog(p_item uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc),'[]') from (
 select i.id as item_id,i.name,coalesce(i.brand,'Unbranded') as brand,i.category,i.subcategory,i.size,i.item_condition,i.color,i.material,i.pattern,i.description,i.condition_notes,
 i.listed_price_cents as price_cents,p.published_at,null::timestamptz as inspected_at,'available'::text as availability,
 'peer_to_peer'::text as sale_mode,false as checkout_enabled,
 (select array_agg('/api/marketplace/public-photos/'||a.id::text order by a.created_at,a.id) from private.marketplace_photo_assets a where a.item_id=i.id and a.withdrawn_at is null and a.provider='supabase') as photo_urls
 from public.items i join private.direct_listing_publications p on p.item_id=i.id
 where (p_item is null or i.id=p_item) and private.direct_listing_visible(i.id) order by p.published_at desc limit 1000
 )x;
$$;
revoke all on function public.direct_catalog(uuid) from public;
grant execute on function public.direct_catalog(uuid) to anon,authenticated;

-- Storage keys are never exposed to anonymous clients. The server checks current
-- publication on every uncached read before using its private storage credential.
create function public.direct_public_photo(p_asset uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('key',a.storage_key,'provider',a.provider) from private.marketplace_photo_assets a
 where a.id=p_asset and a.withdrawn_at is null and a.provider='supabase' and private.direct_listing_visible(a.item_id);
$$;
revoke all on function public.direct_public_photo(uuid) from public,anon,authenticated;
grant execute on function public.direct_public_photo(uuid) to service_role;

create or replace function private.marketplace_visible(p_item uuid,p_viewer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.direct_listing_visible(p_item) or exists(select 1 from public.items i where i.id=p_item and i.sale_mode='peer_to_peer' and (
 (i.status='listed' and i.published_at is not null) or
 (current_database()='shikimomo_staging' and i.status='listing_preparation' and exists(select 1 from private.marketplace_rehearsal_access a where a.item_id=i.id and a.viewer_id=p_viewer))));
$$;
revoke all on function private.marketplace_visible(uuid,uuid) from public,anon,authenticated;
create or replace function public.marketplace_store(p_seller uuid,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$declare s private.marketplace_sellers%rowtype;begin
 select * into s from private.marketplace_sellers where id=p_seller;if s.id is null then return null;end if;
 return jsonb_build_object('id',s.id,'name',s.display_name,'city',s.city,'bio',s.bio,'businessType',s.business_type,'vacation',s.vacation,
 'followed',exists(select 1 from private.marketplace_follows where user_id=auth.uid() and seller_id=s.id),
 'items',coalesce((select jsonb_agg(x) from(select i.id,i.name,i.brand,i.category,i.size,i.item_condition,i.listed_price_cents as price,i.listing_version as version,
 case when private.direct_listing_visible(i.id) then array(select jsonb_array_elements_text(public.direct_catalog(i.id)->0->'photo_urls')) when i.published_at is not null then i.photo_urls else '{}'::text[] end as photos from public.items i where i.owner_id=s.user_id and private.marketplace_visible(i.id,auth.uid()) order by i.created_at desc,i.id limit 24 offset (greatest(1,least(coalesce(p_page,1),10000))-1)*24)x),'[]'::jsonb));end$$;

notify pgrst,'reload schema';
