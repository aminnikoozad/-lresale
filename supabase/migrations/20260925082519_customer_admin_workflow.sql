-- Additive customer workspace. No payment processing or payouts enabled.
create table public.customer_account_updates (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.profiles(id),
 author_id uuid not null references auth.users(id),
 body text not null check(char_length(body) between 2 and 2000),
 customer_visible boolean not null default false,
 created_at timestamptz not null default now()
);
create index on public.customer_account_updates(customer_id,created_at desc);
alter table public.customer_account_updates enable row level security;
revoke all on public.customer_account_updates from public,anon,authenticated;
grant select on public.customer_account_updates to authenticated;
create policy customer_updates_own on public.customer_account_updates for select to authenticated
 using(customer_id=(select auth.uid()) and customer_visible);

create function public.admin_customer_workspace(target_customer uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.can_manage_items() or coalesce(auth.jwt()->>'aal','') <> 'aal2' then raise exception 'MFA and item management permission required'; end if;
 return (select jsonb_build_object(
 'id',p.id,'name',p.full_name,'username',p.username,'email',u.email,
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'code',o.item_code,'name',i.name,'status',i.status,'initial',i.initial_approved_price_cents,'current',i.listed_price_cents,'sold',i.sold_price_cents,'sellerBps',i.locked_seller_commission_bps,'platformBps',i.locked_platform_commission_bps) order by i.created_at desc) from public.items i left join public.item_operations o on o.item_id=i.id where i.owner_id=p.id),'[]'::jsonb),
 'updates',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select id,body,customer_visible,created_at from public.customer_account_updates where customer_id=p.id order by created_at desc limit 100)n),'[]'::jsonb),
 'ledger',coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at desc) from (select id,item_id,amount_cents,status,transaction_type,description,created_at from public.wallet_transactions where user_id=p.id order by created_at desc limit 100)w),'[]'::jsonb)
 ) from public.profiles p join auth.users u on u.id=p.id where p.id=target_customer);
end;$$;

create function public.admin_add_customer_update(target_customer uuid,content text,visible_to_customer boolean) returns void
language plpgsql security definer set search_path='' as $$
declare entry_id uuid;
begin
 if not public.can_manage_items() or coalesce(auth.jwt()->>'aal','') <> 'aal2' then raise exception 'MFA and item management permission required'; end if;
 if visible_to_customer is null then raise exception 'Choose visibility'; end if;
 insert into public.customer_account_updates(customer_id,author_id,body,customer_visible)
 values(target_customer,auth.uid(),trim(content),visible_to_customer) returning id into entry_id;
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value)
 values(auth.uid(),'customer_update_created','customer',target_customer::text,jsonb_build_object('updateId',entry_id,'customerVisible',visible_to_customer));
end;$$;

create function public.set_my_username(candidate text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if candidate is null or lower(trim(candidate)) !~ '^[a-z0-9][a-z0-9._]{2,29}$' then raise exception 'Use 3–30 letters, numbers, dots or underscores'; end if;
 update public.profiles set username=lower(trim(candidate)) where id=auth.uid();
end;$$;

-- One recorded sale per item; pending credit is not withdrawable or a bank transfer.
create table public.item_sale_records (
 item_id uuid primary key references public.items(id),
 seller_id uuid not null references public.profiles(id),
 recorded_by uuid not null references auth.users(id),
 reference text not null unique check(char_length(reference) between 4 and 160),
 sale_cents integer not null check(sale_cents between 1 and 100000000),
 seller_bps integer not null check(seller_bps between 0 and 10000),
 seller_cents integer not null check(seller_cents>0),
 wallet_id uuid not null unique references public.wallet_transactions(id),
 created_at timestamptz not null default now()
);
alter table public.item_sale_records enable row level security;
revoke all on public.item_sale_records from public,anon,authenticated;
create function public.admin_record_item_sale(target_item uuid,expected_price integer,payment_reference text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.items%rowtype; existing public.item_sale_records%rowtype; credit integer; wallet uuid;
begin
 if coalesce(auth.jwt()->>'aal','') <> 'aal2' or not exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Owner/Admin with MFA required'; end if;
 if payment_reference is null or char_length(trim(payment_reference)) not between 4 and 160 or expected_price is null then raise exception 'Valid sale reference and price required'; end if;
 select * into i from public.items where id=target_item for update;
 if not found then raise exception 'Item unavailable'; end if;
 select * into existing from public.item_sale_records where item_id=target_item;
 if found then
   if existing.reference=trim(payment_reference) and existing.sale_cents=expected_price then return existing.wallet_id; end if;
   raise exception 'Sale already recorded; use reconciliation for corrections';
 end if;
 if i.status <> 'listed' or i.seller_pricing_approved_at is null or i.locked_seller_commission_bps is null or i.locked_platform_commission_bps is null
 or i.locked_seller_commission_bps+i.locked_platform_commission_bps<>10000 or i.listed_price_cents is distinct from expected_price then raise exception 'Approved listed item and matching current price required'; end if;
 if exists(select 1 from public.bundle_items where item_id=i.id) then raise exception 'Bundle members require bundle settlement'; end if;
 if exists(select 1 from public.inventory_reservations where item_id=i.id and status='active' and expires_at>now()) then raise exception 'Item has an active checkout reservation'; end if;
 if exists(select 1 from public.wallet_transactions where item_id=i.id and transaction_type='sale_credit') then raise exception 'Existing credit requires reconciliation'; end if;
 credit:=round(expected_price::numeric*i.locked_seller_commission_bps/10000)::integer;
 update public.items set status='sold',sold_price_cents=expected_price where id=i.id;
 insert into public.wallet_transactions(user_id,item_id,amount_cents,transaction_type,status,description)
 values(i.owner_id,i.id,credit,'sale_credit','pending','Item sale earnings — pending settlement review') returning id into wallet;
 insert into public.item_sale_records(item_id,seller_id,recorded_by,reference,sale_cents,seller_bps,seller_cents,wallet_id)
 values(i.id,i.owner_id,auth.uid(),trim(payment_reference),expected_price,i.locked_seller_commission_bps,credit,wallet);
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value)
 values(auth.uid(),'item_sale_recorded','item',i.id::text,jsonb_build_object('saleCents',expected_price,'sellerCents',credit,'sellerBps',i.locked_seller_commission_bps,'walletId',wallet));
 return wallet;
end;$$;
revoke all on function public.admin_customer_workspace(uuid),public.admin_add_customer_update(uuid,text,boolean),public.set_my_username(text),public.admin_record_item_sale(uuid,integer,text) from public,anon;
grant execute on function public.admin_customer_workspace(uuid),public.admin_add_customer_update(uuid,text,boolean),public.set_my_username(text),public.admin_record_item_sale(uuid,integer,text) to authenticated;

-- Serialize form attempt checks with the existing limiter to prevent parallel bypass.
create function public.consume_auth_form_attempt(p_rate_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(1877661221::bigint);
 result:=public.check_admin_login_rate_limit(p_rate_key);
 if (result->>'allowed')::boolean then perform public.record_admin_login_failure(p_rate_key); end if;
 return result;
end;$$;
revoke all on function public.consume_auth_form_attempt(text) from public;
grant execute on function public.consume_auth_form_attempt(text) to anon,authenticated;
