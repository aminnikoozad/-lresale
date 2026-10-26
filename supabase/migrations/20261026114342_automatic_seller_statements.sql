create sequence private.seller_statement_number;
create table private.seller_statements(
 id uuid primary key default gen_random_uuid(),number text not null unique,
 seller_id uuid not null references auth.users(id),wallet_id uuid not null references public.wallet_transactions(id),
 item_id uuid not null references public.items(id),sale_mode text not null check(sale_mode in ('managed_consignment','peer_to_peer')),
 event text not null check(event in ('sale_recorded','earnings_confirmed','sale_reversed')),
 snapshot jsonb not null,issued_at timestamptz not null default now(),unique(wallet_id,event)
);
create table private.seller_statement_emails(
 id uuid primary key default gen_random_uuid(),statement_id uuid not null unique references private.seller_statements(id),
 status text not null default 'waiting_email' check(status in ('waiting_email','pending','sending','accepted','failed','cancelled')),
 recipient_email text,payload jsonb,attempts integer not null default 0,next_attempt_at timestamptz not null default now(),
 first_attempt_at timestamptz,attempted_at timestamptz,http_request_id bigint,last_status integer,provider_id text,accepted_at timestamptz
);
alter table private.seller_statements enable row level security;
alter table private.seller_statement_emails enable row level security;
revoke all on private.seller_statements,private.seller_statement_emails from public,anon,authenticated,service_role;
revoke all on sequence private.seller_statement_number from public,anon,authenticated,service_role;
create index seller_statements_owner on private.seller_statements(seller_id,issued_at desc,id);
create index seller_statement_email_pending on private.seller_statement_emails(next_attempt_at) where status in ('waiting_email','pending','sending');

create function private.issue_seller_statement(p_wallet uuid,p_event text) returns void language plpgsql security definer set search_path='' as $$
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
 jsonb_build_object('itemName',i.name,'grossCents',gross,'discountCents',coalesce(discount,0),'netSaleCents',net,'commissionCents',gross-seller_amount,'platformShareCents',net-seller_amount,'sellerCents',seller_amount,'currency','CAD','commissionSnapshot',w.commission_snapshot,'bankTransferConfirmed',false))
 on conflict(wallet_id,event) do nothing returning id into sid;
 if sid is not null then insert into private.seller_statement_emails(statement_id) values(sid) on conflict do nothing;end if;
end$$;
revoke all on function private.issue_seller_statement(uuid,text) from public,anon,authenticated,service_role;

create function private.seller_statement_sale_event() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then perform private.issue_seller_statement(new.wallet_id,'sale_recorded');
 elsif new.reversed_at is not null and old.reversed_at is null then perform private.issue_seller_statement(new.wallet_id,'sale_reversed');end if;return new;end$$;
create trigger seller_statement_order_sale after insert or update of reversed_at on public.order_seller_credits for each row execute function private.seller_statement_sale_event();
create function private.seller_statement_manual_event() returns trigger language plpgsql security definer set search_path='' as $$begin perform private.issue_seller_statement(new.wallet_id,'sale_recorded');return new;end$$;
create trigger seller_statement_manual_sale after insert on public.item_sale_records for each row execute function private.seller_statement_manual_event();
create function private.seller_statement_wallet_event() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status is distinct from old.status then
 if new.status='completed' then perform private.issue_seller_statement(new.id,'earnings_confirmed');
 elsif new.status='reversed' then perform private.issue_seller_statement(new.id,'sale_reversed');end if;end if;return new;end$$;
create trigger seller_statement_wallet_status after update of status on public.wallet_transactions for each row execute function private.seller_statement_wallet_event();
revoke all on function private.seller_statement_sale_event(),private.seller_statement_manual_event(),private.seller_statement_wallet_event() from public,anon,authenticated,service_role;

create function public.my_seller_statements(p_id uuid default null,p_page integer default 1,p_mode text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required';end if;
 if p_mode is not null and p_mode not in ('managed_consignment','peer_to_peer') then raise exception 'Invalid selling method';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.issued_at desc,x.id) from (
 select s.id,s.number,s.sale_mode,s.event,s.snapshot,s.issued_at,w.status as ledger_status,e.status as email_status,
 exists(select 1 from private.seller_statements r where r.wallet_id=s.wallet_id and r.event='sale_reversed') as reversed
 from private.seller_statements s join public.wallet_transactions w on w.id=s.wallet_id left join private.seller_statement_emails e on e.statement_id=s.id
 where s.seller_id=auth.uid() and (p_id is null or s.id=p_id) and (p_mode is null or s.sale_mode=p_mode)
 order by s.issued_at desc,s.id limit 50 offset (greatest(1,least(coalesce(p_page,1),10000))-1)*50)x),'[]');
end$$;
revoke all on function public.my_seller_statements(uuid,integer,text) from public,anon;
grant execute on function public.my_seller_statements(uuid,integer,text) to authenticated;

create function private.dispatch_seller_statement_emails() returns void language plpgsql security definer set search_path='' as $$
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
  body:=concat_ws(E'\n','SHIKIMOMO · Sales statement / Relevé de vente',document_record.number,mode_label,event_label,
   'Item / Article: '||(document_record.snapshot->>'itemName'),
   'Sale amount / Montant de vente: '||to_char((document_record.snapshot->>'grossCents')::numeric/100,'FM999999990.00')||' CAD',
   'Discount / Réduction: '||to_char((document_record.snapshot->>'discountCents')::numeric/100,'FM999999990.00')||' CAD',
   'Recorded commission / Commission enregistrée: '||to_char((document_record.snapshot->>'commissionCents')::numeric/100,'FM999999990.00')||' CAD',
   'Seller earnings / Revenus du vendeur: '||to_char((document_record.snapshot->>'sellerCents')::numeric/100,'FM999999990.00')||' CAD',status_note,
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
end$$;
revoke all on function private.dispatch_seller_statement_emails() from public,anon,authenticated,service_role;
select cron.schedule('shikimomo-seller-statements','* * * * *','select private.dispatch_seller_statement_emails()');
notify pgrst,'reload schema';
