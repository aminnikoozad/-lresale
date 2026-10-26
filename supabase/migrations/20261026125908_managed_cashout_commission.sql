begin;
-- The live cutover was prepared before any managed sale credit existed.
-- Refuse to reinterpret historical net credits if sales appeared meanwhile.
do $$begin
 if exists(select 1 from public.wallet_transactions where sale_mode='managed_consignment' and transaction_type='sale_credit') then
  raise exception 'Existing managed sale credits require explicit migration review';
 end if;
end;$$;
-- Managed sales accrue before commission; personal sales remain on their own policy.
CREATE OR REPLACE FUNCTION private.guard_wallet_sale_mode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   new.commission_snapshot:=jsonb_build_object('saleMode',i.sale_mode,'settlementBasis','cashout_v1','commissionDeferred',true);
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
end$function$
;
CREATE OR REPLACE FUNCTION private.issue_seller_statement(p_wallet uuid, p_event text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.wallet_transactions%rowtype;i public.items%rowtype;c public.order_seller_credits%rowtype;m public.item_sale_records%rowtype;
 gross integer;discount integer:=0;net integer;seller_amount integer;sid uuid;proof boolean:=false;
begin
 select * into w from public.wallet_transactions where id=p_wallet;
 if w.id is null or w.transaction_type<>'sale_credit' or p_event not in ('sale_recorded','earnings_confirmed','sale_reversed') then return;end if;
 select * into i from public.items where id=w.item_id;
 if i.owner_id is distinct from w.user_id or i.sale_mode is distinct from w.sale_mode then return;end if;
 select * into c from public.order_seller_credits where wallet_id=w.id;
 if found then
  select exists(select 1 from public.orders where id=c.order_id and payment_status in ('paid','refunded') and paid_at is not null) into proof;
  if c.seller_id<>w.user_id or c.sale_mode<>w.sale_mode or c.seller_cents<>w.amount_cents then return;end if;
  gross:=c.sale_cents;seller_amount:=c.seller_cents;
  select coalesce(discount_cents,0) into discount from public.order_items where id=c.order_item_id;
 else
  select * into m from public.item_sale_records where wallet_id=w.id;
  proof:=m.item_id is not null and m.seller_id=w.user_id and m.seller_cents=w.amount_cents and i.sale_mode='managed_consignment';
  gross:=m.sale_cents;seller_amount:=m.seller_cents;
 end if;
 if not proof or gross is null then return;end if;
 if p_event='earnings_confirmed' and w.status<>'completed' then return;end if;
 if p_event='sale_recorded' and w.status not in ('pending','completed') then return;end if;
 if p_event='sale_reversed' and w.status<>'reversed' and c.reversed_at is null then return;end if;
 if exists(select 1 from private.seller_statements where wallet_id=w.id and event=p_event) then return;end if;
 net:=gross-coalesce(discount,0);
 insert into private.seller_statements(number,seller_id,wallet_id,item_id,sale_mode,event,snapshot)
 values('SM-'||to_char(now() at time zone 'America/Toronto','YYYY')||'-'||lpad(nextval('private.seller_statement_number')::text,9,'0'),w.user_id,w.id,i.id,w.sale_mode,p_event,
 jsonb_build_object('itemName',i.name,'grossCents',gross,'discountCents',coalesce(discount,0),'netSaleCents',net,'commissionCents',case when w.commission_snapshot->>'settlementBasis'='cashout_v1' then null else gross-seller_amount end,'platformShareCents',net-seller_amount,'sellerCents',seller_amount,'currency','CAD','commissionSnapshot',w.commission_snapshot,'bankTransferConfirmed',false))
 on conflict(wallet_id,event) do nothing returning id into sid;
 if sid is not null then insert into private.seller_statement_emails(statement_id) values(sid) on conflict do nothing;end if;
end$function$
;
CREATE OR REPLACE FUNCTION private.dispatch_seller_statement_emails()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j record;response_record record;document_record private.seller_statements%rowtype;email text;body text;api_key text;request_number bigint;mode_label text;event_label text;status_note text;
begin
 if not pg_try_advisory_xact_lock(74202610261143::bigint) then return;end if;
 for j in select * from private.seller_statement_emails where status='sending' for update skip locked loop
  select * into response_record from net._http_response where id=j.http_request_id;
  if found then
   if response_record.status_code between 200 and 299 then update private.seller_statement_emails set status='accepted',last_status=response_record.status_code,provider_id=response_record.content::jsonb->>'id',accepted_at=now(),payload=null where id=j.id;
   elsif j.attempts>=8 or (response_record.status_code between 400 and 499 and response_record.status_code not in (408,429)) then update private.seller_statement_emails set status='failed',last_status=response_record.status_code where id=j.id;
   else update private.seller_statement_emails set status='pending',last_status=response_record.status_code,next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,j.attempts)::integer)) where id=j.id;end if;
  elsif j.attempted_at<now()-interval '2 minutes' then update private.seller_statement_emails set status=case when attempts>=8 then 'failed' else 'pending' end,next_attempt_at=now()+interval '2 minutes' where id=j.id;end if;
 end loop;
 update private.seller_statement_emails set status='failed' where status='pending' and first_attempt_at<now()-interval '23 hours';
 update private.seller_statement_emails e set status='cancelled' where e.status in ('waiting_email','pending') and exists(select 1 from private.seller_statements original_stmt join private.seller_statements reversal_stmt on reversal_stmt.wallet_id=original_stmt.wallet_id and reversal_stmt.event='sale_reversed' where original_stmt.id=e.statement_id and original_stmt.event<>'sale_reversed');
 -- Resolve only the account owner'document_record verified email. No address is supplied by a form.
 for j in select e.* from private.seller_statement_emails e join private.seller_statements st on st.id=e.statement_id where e.status='waiting_email' order by st.issued_at,st.number limit 50 for update of e skip locked loop
  select * into document_record from private.seller_statements where id=j.statement_id;
  select u.email into email from auth.users u where u.id=document_record.seller_id and u.email_confirmed_at is not null;
  if email is null then continue;end if;
  mode_label:=case document_record.sale_mode when 'peer_to_peer' then 'Personal sale / Vente personnelle' else 'Sold by Shikimomo / Vendu par Shikimomo' end;
  event_label:=case document_record.event when 'sale_reversed' then 'Sale reversed / Vente annulée' when 'earnings_confirmed' then 'Earnings confirmed / Revenus confirmés' else 'Sale recorded / Vente enregistrée' end;
  status_note:=case document_record.event when 'sale_reversed' then 'Related earnings have been reversed. / Les revenus liés ont été annulés.' when 'earnings_confirmed' then 'Earnings confirmed in your account; this is not proof of a bank transfer. / Revenus confirmés dans votre compte; ceci ne confirme pas un virement bancaire.' else 'Earnings pending settlement review, not money transferred to your bank. / Revenus en attente de règlement, sans virement bancaire.' end;
  if document_record.snapshot#>>'{commissionSnapshot,settlementBasis}'='cashout_v1' then status_note:=status_note||' Amount shown is before cash-out commission; final commission is calculated once when withdrawal is requested. / Montant avant commission de retrait; la commission finale est calculée une seule fois lors de la demande.';end if;
  body:=concat_ws(E'\n','SHIKIMOMO · Sales statement / Relevé de vente',document_record.number,mode_label,event_label,
   'Item / Article: '||(document_record.snapshot->>'itemName'),
   'Sale amount / Montant de vente: '||to_char((document_record.snapshot->>'grossCents')::numeric/100,'FM999999990.00')||' CAD',
   'Discount / Réduction: '||to_char((document_record.snapshot->>'discountCents')::numeric/100,'FM999999990.00')||' CAD',
   'Recorded commission / Commission enregistrée: '||to_char((document_record.snapshot->>'commissionCents')::numeric/100,'FM999999990.00')||' CAD',
   'Account credit / Crédit au compte: '||to_char((document_record.snapshot->>'sellerCents')::numeric/100,'FM999999990.00')||' CAD',status_note,
   'View and print your statement / Consulter et imprimer le relevé :','https://shikimomo.com/account/seller/statements/'||document_record.id::text,
   'Sign in to your account. / Connectez-vous à votre compte.');
  update private.seller_statement_emails set status='pending',recipient_email=email,payload=jsonb_build_object('from','Shikimomo <notifications@shikimomo.com>','to',jsonb_build_array(email),'subject','Shikimomo · Sales statement / Relevé · '||document_record.number,'text',body) where id=j.id;
 end loop;
 update private.seller_statement_emails e set status='failed' where e.status='pending' and not exists(select 1 from private.seller_statements owner_stmt join auth.users u on u.id=owner_stmt.seller_id where owner_stmt.id=e.statement_id and u.email_confirmed_at is not null and u.email=e.recipient_email);
 select decrypted_secret into api_key from vault.decrypted_secrets where name='shikimomo_pickup_resend';
 if api_key is null then return;end if;
 for j in select e.* from private.seller_statement_emails e join private.seller_statements st on st.id=e.statement_id where e.status='pending' and e.next_attempt_at<=now() order by st.issued_at,st.number limit 1 for update of e skip locked loop
  request_number:=net.http_post(url:='https://api.resend.com/emails',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||api_key,'Idempotency-Key','shikimomo-seller-statement-'||j.id::text),body:=j.payload,timeout_milliseconds:=15000);
  update private.seller_statement_emails set status='sending',attempts=attempts+1,http_request_id=request_number,first_attempt_at=coalesce(first_attempt_at,now()),attempted_at=now() where id=j.id;
 end loop;
end$function$
;
CREATE OR REPLACE FUNCTION public.admin_record_item_sale(target_item uuid, expected_price integer, payment_reference text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 credit:=expected_price; -- Managed commission is charged only on cash-out.
 if i.sale_mode<>'managed_consignment' then raise exception 'Personal sales require their own verified pipeline';end if;
 update public.items set status='sold',sold_price_cents=expected_price where id=i.id;
 insert into public.wallet_transactions(user_id,item_id,amount_cents,transaction_type,status,description)
 values(i.owner_id,i.id,credit,'sale_credit','pending','Item sale earnings — pending settlement review') returning id into wallet;
 insert into public.item_sale_records(item_id,seller_id,recorded_by,reference,sale_cents,seller_bps,seller_cents,wallet_id)
 values(i.id,i.owner_id,auth.uid(),trim(payment_reference),expected_price,10000,credit,wallet);
 insert into public.audit_logs(admin_user_id,action,entity_type,entity_id,new_value)
 values(auth.uid(),'item_sale_recorded','item',i.id::text,jsonb_build_object('saleCents',expected_price,'sellerCents',credit,'sellerBps',10000,'commissionBasis','cashout_v1','walletId',wallet));
 return wallet;
end;$function$
;
CREATE OR REPLACE FUNCTION private.sync_paid_order_seller_wallets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

      seller_credit := case when item_row.sale_mode='managed_consignment' then line.unit_price_cents else round(line.unit_price_cents::numeric * item_row.locked_seller_commission_bps / 10000)::integer end;
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
        case when item_row.sale_mode='managed_consignment' then 10000 else item_row.locked_seller_commission_bps end,seller_credit
      );

      update public.items
         set status = 'sold',
             sold_price_cents = line.unit_price_cents
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
$function$
;


revoke all on function private.guard_wallet_sale_mode(),private.sync_paid_order_seller_wallets(),private.issue_seller_statement(uuid,text),private.dispatch_seller_statement_emails() from public,anon,authenticated,service_role;
revoke all on function public.admin_record_item_sale(uuid,integer,text) from public,anon;
grant execute on function public.admin_record_item_sale(uuid,integer,text) to authenticated;

-- Withdrawal requests reserve gross sale credits, never a personal-selling balance.
create sequence private.managed_cashout_number;
create table private.managed_cashouts(
 id uuid primary key,number text not null unique,seller_id uuid not null references auth.users(id),
 gross_cents integer not null check(gross_cents>0),commission_bps integer not null check(commission_bps between 0 and 10000),
 commission_cents integer not null check(commission_cents>=0),service_fee_cents integer not null check(service_fee_cents>=0),net_cents integer not null check(net_cents>0),
 policy_snapshot jsonb not null,status text not null default 'requested' check(status in ('requested','cancelled','invalidated','paid')),
 requested_at timestamptz not null default now(),processing_from timestamptz not null default now()+interval '3 days',processing_to timestamptz not null default now()+interval '5 days',
 check(net_cents=gross_cents-commission_cents-service_fee_cents)
);
create table private.managed_cashout_allocations(
 request_id uuid not null references private.managed_cashouts(id),wallet_id uuid not null references public.wallet_transactions(id),
 gross_cents integer not null check(gross_cents>0),primary key(request_id,wallet_id)
);
create table private.managed_cashout_batch_fees(
 request_id uuid not null references private.managed_cashouts(id),batch_id uuid not null references public.collection_requests(id),
 amount_cents integer not null check(amount_cents>=0),primary key(request_id,batch_id)
);
alter table private.managed_cashouts enable row level security;
alter table private.managed_cashout_allocations enable row level security;
alter table private.managed_cashout_batch_fees enable row level security;
revoke all on private.managed_cashouts,private.managed_cashout_allocations,private.managed_cashout_batch_fees from public,anon,authenticated,service_role;
revoke all on sequence private.managed_cashout_number from public,anon,authenticated,service_role;
create index managed_cashouts_owner on private.managed_cashouts(seller_id,requested_at desc);
create index managed_cashout_allocations_wallet on private.managed_cashout_allocations(wallet_id);

create table private.managed_sale_releases(
 wallet_id uuid primary key references public.wallet_transactions(id),
 recorded_at timestamptz not null default now(),available_at timestamptz not null default now()+interval '30 days'
);
alter table private.managed_sale_releases enable row level security;
revoke all on private.managed_sale_releases from public,anon,authenticated,service_role;
create function private.register_managed_sale_release() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.wallet_transactions w join public.items i on i.id=w.item_id where w.id=new.wallet_id and w.user_id=new.seller_id and i.owner_id=new.seller_id and w.item_id=new.item_id and w.sale_mode='managed_consignment' and i.sale_mode='managed_consignment' and w.amount_cents=new.seller_cents and w.commission_snapshot->>'settlementBasis'='cashout_v1') then
  insert into private.managed_sale_releases(wallet_id) values(new.wallet_id) on conflict do nothing;
 end if;return new;
end;$$;
revoke all on function private.register_managed_sale_release() from public,anon,authenticated,service_role;
create trigger managed_sale_release_online after insert on public.order_seller_credits for each row execute function private.register_managed_sale_release();
create trigger managed_sale_release_manual after insert on public.item_sale_records for each row execute function private.register_managed_sale_release();

create function private.managed_available_credits(p_user uuid)
returns table(wallet_id uuid,batch_id uuid,available integer,cycle_complete boolean)
language sql stable security definer set search_path='' as $$
 select w.id,i.collection_request_id,
  greatest(0,w.amount_cents-coalesce((select sum(a.gross_cents)::integer from private.managed_cashout_allocations a join private.managed_cashouts r on r.id=a.request_id where a.wallet_id=w.id and r.status in ('requested','paid')),0)),
  release.available_at<=now() and exists(select 1 from public.collection_requests b where b.id=i.collection_request_id and b.user_id=p_user)
 from public.wallet_transactions w join public.items i on i.id=w.item_id join private.managed_sale_releases release on release.wallet_id=w.id
 where w.user_id=p_user and i.owner_id=p_user and w.sale_mode='managed_consignment' and i.sale_mode='managed_consignment'
 and w.transaction_type='sale_credit' and w.status='completed' and w.commission_snapshot->>'settlementBasis'='cashout_v1'
 and (exists(select 1 from public.item_sale_records s where s.wallet_id=w.id and s.item_id=i.id and s.seller_id=p_user and s.seller_cents=w.amount_cents and s.seller_bps=10000 and s.sale_cents=w.amount_cents)
 or exists(select 1 from public.order_seller_credits c join public.orders o on o.id=c.order_id join public.order_items oi on oi.id=c.order_item_id where c.wallet_id=w.id and c.item_id=i.id and c.seller_id=p_user and c.sale_mode='managed_consignment' and c.seller_cents=w.amount_cents and c.seller_bps=10000 and c.sale_cents=w.amount_cents and c.reversed_at is null and o.payment_status='paid' and o.paid_at is not null));
$$;
revoke all on function private.managed_available_credits(uuid) from public,anon,authenticated,service_role;

create function private.managed_cashout_quote(p_user uuid,p_gross integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare row record;remaining integer:=p_gross;allocations jsonb:='[]';batches uuid[]:='{}';rules jsonb:=public.get_selling_rules();tier jsonb;bps integer;commission integer;fees integer:=0;available_total bigint;
begin
 if p_gross is null or p_gross not between 1 and 100000000 then raise exception 'Enter a valid gross withdrawal amount';end if;
 -- Non-sale adjustments must be reconciled before introducing a withdrawal hold.
 if exists(select 1 from public.wallet_transactions w where user_id=p_user and sale_mode='managed_consignment' and status='completed' and transaction_type<>'sale_credit' and amount_cents<>0 and not exists(select 1 from public.order_seller_credits c where c.reversal_wallet_id=w.id and c.reversed_at is not null)) then raise exception 'Account adjustments require settlement review';end if;
 select coalesce(sum(available),0) into available_total from private.managed_available_credits(p_user) where cycle_complete;
 if available_total<p_gross then raise exception 'Insufficient eligible funds; each sale must be at least 30 days old';end if;
 for row in select * from private.managed_available_credits(p_user) where cycle_complete and available>0 order by batch_id,wallet_id loop
  allocations:=allocations||jsonb_build_array(jsonb_build_object('walletId',row.wallet_id,'batchId',row.batch_id,'grossCents',least(remaining,row.available)));
  batches:=array_append(batches,row.batch_id);remaining:=remaining-least(remaining,row.available);exit when remaining=0;
 end loop;
 select value into tier from jsonb_array_elements(rules->'commissionTiers') where value->>'maxCents' is null or p_gross<=(value->>'maxCents')::integer order by (value->>'minCents')::integer limit 1;
 bps:=(tier->>'platformBps')::integer;
 if bps is null or bps not between 0 and 10000 then raise exception 'Withdrawal fee policy unavailable';end if;
 commission:=round(p_gross::numeric*bps/10000)::integer;
 select coalesce(sum(c.processing_fee_cents+c.bag_fee_cents+c.pickup_fee_cents),0)::integer into fees from public.collection_requests c
 where c.id=any(batches) and c.user_id=p_user and not exists(select 1 from private.managed_cashout_batch_fees f join private.managed_cashouts r on r.id=f.request_id where f.batch_id=c.id and r.status in ('requested','paid'));
 if p_gross-commission-fees<=0 then raise exception 'Withdrawal amount does not cover commission and outstanding batch fees';end if;
 return jsonb_build_object('grossCents',p_gross,'commissionBps',bps,'commissionCents',commission,'serviceFeeCents',fees,'netCents',p_gross-commission-fees,'allocations',allocations,'policy',jsonb_build_object('basis','cashout_v1','tiers',jsonb_set(rules->'commissionTiers','{0,minCents}','1'::jsonb),'processingDaysMin',3,'processingDaysMax',5,'currency','CAD'));
end;
$$;
revoke all on function private.managed_cashout_quote(uuid,integer) from public,anon,authenticated,service_role;

create function public.my_managed_cashouts(p_preview_gross integer default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();preview jsonb;problem text;eligible bigint;locked bigint;
begin
 select coalesce(sum(available) filter(where cycle_complete),0),coalesce(sum(available) filter(where not cycle_complete),0) into eligible,locked from private.managed_available_credits(u);
 if p_preview_gross is not null then begin preview:=private.managed_cashout_quote(u,p_preview_gross)-'allocations';exception when raise_exception then problem:=sqlerrm;when others then problem:='Withdrawal preview temporarily unavailable';end;end if;
 return jsonb_build_object('availableGrossCents',eligible,'cycleLockedGrossCents',locked,'preview',preview,'previewError',problem,
 'requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc) from (select id,number,gross_cents,commission_bps,commission_cents,service_fee_cents,net_cents,status,requested_at,processing_from,processing_to from private.managed_cashouts where seller_id=u order by requested_at desc limit 100)x),'[]'));
end;
$$;
revoke all on function public.my_managed_cashouts(integer) from public,anon;
grant execute on function public.my_managed_cashouts(integer) to authenticated;

create function public.request_managed_cashout(p_id uuid,p_gross integer,p_commission integer,p_fees integer,p_net integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();q jsonb;existing private.managed_cashouts%rowtype;a jsonb;
begin
 if p_id is null then raise exception 'Request reference required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,20261026));
 select * into existing from private.managed_cashouts where id=p_id;
 if found then
  if existing.seller_id<>u or (existing.gross_cents,existing.commission_cents,existing.service_fee_cents,existing.net_cents) is distinct from (p_gross,p_commission,p_fees,p_net) then raise exception 'Request reference conflict';end if;
  return existing.id;
 end if;
 -- Lock sources as well as the seller, so simultaneous refunds and holds cannot race.
 perform 1 from public.wallet_transactions where user_id=u and sale_mode='managed_consignment' and transaction_type='sale_credit' order by id for update;
 q:=private.managed_cashout_quote(u,p_gross);
 if (p_commission,p_fees,p_net) is distinct from ((q->>'commissionCents')::integer,(q->>'serviceFeeCents')::integer,(q->>'netCents')::integer) then raise exception 'Quote changed; review the updated amounts before submitting';end if;
 insert into private.managed_cashouts(id,number,seller_id,gross_cents,commission_bps,commission_cents,service_fee_cents,net_cents,policy_snapshot)
 values(p_id,'MC-'||lpad(nextval('private.managed_cashout_number')::text,9,'0'),u,p_gross,(q->>'commissionBps')::integer,p_commission,p_fees,p_net,q->'policy');
 for a in select value from jsonb_array_elements(q->'allocations') loop
  insert into private.managed_cashout_allocations values(p_id,(a->>'walletId')::uuid,(a->>'grossCents')::integer);
 end loop;
 insert into private.managed_cashout_batch_fees(request_id,batch_id,amount_cents)
 select p_id,c.id,c.processing_fee_cents+c.bag_fee_cents+c.pickup_fee_cents from public.collection_requests c
 where c.id in(select distinct (x->>'batchId')::uuid from jsonb_array_elements(q->'allocations')x)
 and not exists(select 1 from private.managed_cashout_batch_fees f join private.managed_cashouts r on r.id=f.request_id where f.batch_id=c.id and r.status in ('requested','paid'));
 return p_id;
end;
$$;
revoke all on function public.request_managed_cashout(uuid,integer,integer,integer,integer) from public,anon;
grant execute on function public.request_managed_cashout(uuid,integer,integer,integer,integer) to authenticated;

create function public.cancel_managed_cashout(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.marketplace_require_user();begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,20261026));
 update private.managed_cashouts set status='cancelled' where id=p_id and seller_id=u and status='requested';
 if not found then raise exception 'Request cannot be cancelled';end if;
end;
$$;
revoke all on function public.cancel_managed_cashout(uuid) from public,anon;
grant execute on function public.cancel_managed_cashout(uuid) to authenticated;

create function private.invalidate_managed_cashout() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='reversed' and old.status is distinct from 'reversed' then
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,20261026));
  update private.managed_cashouts set status='invalidated' where status='requested' and id in(select request_id from private.managed_cashout_allocations where wallet_id=new.id);
 end if;return new;
end;
$$;
revoke all on function private.invalidate_managed_cashout() from public,anon,authenticated,service_role;
create trigger invalidate_managed_cashout after update of status on public.wallet_transactions for each row execute function private.invalidate_managed_cashout();

create function public.admin_managed_cashouts() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2' or not public.can_manage_items() then raise exception 'MFA and item management permission required';end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from(select * from private.managed_cashouts order by requested_at desc limit 200)r),'[]');
end;
$$;
revoke all on function public.admin_managed_cashouts() from public,anon;
grant execute on function public.admin_managed_cashouts() to authenticated;
notify pgrst,'reload schema';

create function private.invalidate_managed_cashout_refund() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.reversed_at is not null and old.reversed_at is null then
  perform pg_advisory_xact_lock(hashtextextended(new.seller_id::text,20261026));
  update private.managed_cashouts set status='invalidated' where status='requested' and id in(select request_id from private.managed_cashout_allocations where wallet_id=new.wallet_id);
 end if;return new;
end;$$;
revoke all on function private.invalidate_managed_cashout_refund() from public,anon,authenticated,service_role;
create trigger managed_cashout_order_refund after update of reversed_at on public.order_seller_credits for each row execute function private.invalidate_managed_cashout_refund();


-- Keep account totals from counting funds already reserved by a withdrawal.
do $patch$
declare d text:=pg_get_functiondef('public.my_seller_balances()'::regprocedure);begin
 if strpos(d,'return result||')=0 then raise exception 'Unexpected seller balance function';end if;
 d:=replace(d,'return result||', $replacement$result:=jsonb_set(result,'{managed_consignment,confirmed}',to_jsonb(greatest(0,(result#>>'{managed_consignment,confirmed}')::bigint-coalesce((select sum(gross_cents) from private.managed_cashouts where seller_id=u and status in ('requested','paid')),0))));
 return result||$replacement$);
 execute d;
end;$patch$;

-- Approved support content no longer describes per-item managed commission.
update public.knowledge_base set approved_answer='For sales managed by Shikimomo, commission is deducted once when cash-out is requested, using the gross amount requested before commission. Each recorded sale has a 30-day hold; other items in the batch need not finish selling. Processing a valid request takes 3–5 days. Review the current fee table and the exact withdrawal breakdown before confirming. Personal-selling fees remain separate.'
where status='approved' and (title ilike '%commission%' or title ilike '%seller earnings%' or title ilike '%payout%');
do $patch$
declare d text:=pg_get_functiondef('private.support_quick_reply(text)'::regprocedure);a integer;b integer;begin
 a:=strpos(d,'  if v_rules is not null and q ~ ''(commission|seller share');
 b:=strpos(d,'  if v_rules is not null and q ~ ''(pickup|pick up');
 if a=0 or b<=a then raise exception 'Unexpected support commission branch';end if;
 d:=substr(d,1,a-1)||$reply$
 if v_rules is not null and q ~ '(commission|seller share|platform share|cashout|cash-out|withdraw|how much.*earn|percentage|pourcentage|retrait|versement|combien.*gagne)' then
  return case when v_fr then 'Pour les ventes gérées par Shikimomo, la commission est déduite une seule fois au retrait selon le montant brut demandé, et non le prix de chaque article. Chaque vente enregistrée est bloquée 30 jours, sans attendre les autres articles du lot. Une demande valide est traitée en 3 à 5 jours. Les frais de vente personnelle restent distincts. Consultez le tableau des frais et vérifiez le détail du retrait avant confirmation.' else 'For Shikimomo-managed sales, commission is deducted once at cash-out using the gross amount requested, not each item price. Each recorded sale has a 30-day hold, without waiting for other items in the batch. A valid request is processed in 3–5 days. Personal-selling fees remain separate. Check the current fee table and review the withdrawal breakdown before confirming.' end;
 end if;
$reply$||substr(d,b);execute d;
end;$patch$;
commit;
