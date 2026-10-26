import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './fixtures/marketplace-db.ts';import {identity,seller,other,staff,ids,buyer,enable,offer,prepare,attempt} from './fixtures/buyer-sales-db.ts';
const sql=(n:string)=>readFileSync(new URL(`../supabase/migrations/${n}.sql`,import.meta.url),'utf8');
async function setup(){const db=await marketplaceFixture();await db.exec(sql('20261021114432_marketplace_community_trading'));await db.exec(`
 alter table auth.users add column email text,add column email_confirmed_at timestamptz;
 create table public.item_sale_records(item_id uuid primary key,seller_id uuid,recorded_by uuid,reference text unique,sale_cents integer,seller_bps integer,seller_cents integer,wallet_id uuid unique,created_at timestamptz default now());
 create table public.collection_requests(id uuid primary key,user_id uuid,processing_fee_cents integer default 1200,bag_fee_cents integer default 0,pickup_fee_cents integer default 0);
 create table public.admin_roles(user_id uuid,role text);insert into public.admin_roles values('${staff}','owner');
 create table public.bundle_items(item_id uuid);
 create table public.knowledge_base(title text,status text,approved_answer text);
 create function private.support_quick_reply(p_body text) returns text language plpgsql as $$declare v_rules jsonb:=public.get_selling_rules();q text:=p_body;begin
  if v_rules is not null and q ~ '(commission|seller share)' then return 'old commission';end if;
  if v_rules is not null and q ~ '(pickup|pick up)' then return 'pickup';end if;
  return null;end;$$;
 create schema net;create schema vault;create schema cron;
 create table vault.decrypted_secrets(name text,decrypted_secret text);create table net._http_response(id bigint,status_code integer,content text);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
 create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
 create function private.pilot_category_active(text) returns boolean language sql as $$select true$$;
 create or replace function public.get_selling_rules() returns jsonb language sql as $$select '{"commissionTiers":[{"minCents":800,"maxCents":9999,"sellerBps":4500,"platformBps":5500},{"minCents":10000,"maxCents":24999,"sellerBps":5000,"platformBps":5000},{"minCents":25000,"maxCents":49999,"sellerBps":5500,"platformBps":4500},{"minCents":50000,"maxCents":null,"sellerBps":6500,"platformBps":3500}]}'::jsonb$$;
 `);await db.exec(sql('20261026051515_separate_seller_ledgers_and_direct_publication'));await db.exec(sql('20261026114342_automatic_seller_statements'));await db.exec(sql('20261026125908_managed_cashout_commission'));await db.exec(sql('20261026134431_mature_verified_cashout_requests'));return db;}
async function addSale(db:Awaited<ReturnType<typeof setup>>,index:number,amount:number,batch=randomUUID()){
 await db.exec('reset role');await db.query('insert into collection_requests(id,user_id) values($1,$2) on conflict do nothing',[batch,seller]);
 await db.query('update items set collection_request_id=$1 where id=$2',[batch,ids[index]]);
 const w=(await db.query<{id:string}>("insert into wallet_transactions(user_id,item_id,amount_cents,transaction_type,status) values($1,$2,$3,'sale_credit','completed') returning id",[seller,ids[index],amount])).rows[0].id;
 await db.query('insert into item_sale_records(item_id,seller_id,sale_cents,seller_bps,seller_cents,wallet_id,reference) values($1,$2,$3,10000,$3,$4::uuid,$4::text)',[ids[index],seller,amount,w]);return {w,batch};
}
const quote=async(db:Awaited<ReturnType<typeof setup>>,n:number)=>(await db.query<{v:{preview:{grossCents:number;commissionBps:number;commissionCents:number;serviceFeeCents:number;netCents:number};previewError:string;availableGrossCents:number;cycleLockedGrossCents:number;requests:unknown[]}}>('select public.my_managed_cashouts($1) v',[n])).rows[0].v;
test('30-day hold is per verified sale; tiers use gross withdrawal and fees apply once across partial cash-outs',async()=>{
 const db=await setup();try{
  const first=await addSale(db,0,60000);await identity(db,seller);
  let q=await quote(db,20000);assert.equal(q.availableGrossCents,0);assert.equal(q.cycleLockedGrossCents,60000);assert.match(q.previewError,/30 days/);
  await db.exec('reset role');await db.query("update private.managed_sale_releases set available_at=now()-interval '1 second' where wallet_id=$1",[first.w]);
  const second=await addSale(db,1,20000,first.batch);await identity(db,seller);
  q=await quote(db,20000);assert.equal(q.availableGrossCents,60000);assert.equal(q.cycleLockedGrossCents,20000);assert.equal(q.preview.commissionBps,5000);assert.equal(q.preview.netCents,8800);
  for(const [amount,rate] of [[9999,5500],[10000,5000],[24999,5000],[25000,4500],[49999,4500],[50000,3500]])assert.equal((await quote(db,amount)).preview.commissionBps,rate);
  const id=randomUUID();await db.query('select public.request_managed_cashout($1,20000,10000,1200,8800)',[id]);await db.query('select public.request_managed_cashout($1,20000,10000,1200,8800)',[id]);
  q=await quote(db,20000);assert.equal(q.availableGrossCents,40000);assert.equal(q.requests.length,1);assert.equal(q.preview.serviceFeeCents,0);assert.equal(q.preview.netCents,10000);
  await assert.rejects(db.query('select public.request_managed_cashout($1,50000,17500,0,32500)',[randomUUID()]),/Insufficient/);
  await assert.rejects(db.query('select public.request_managed_cashout($1,20000,1,0,19999)',[randomUUID()]),/Quote changed/);
  await db.query('select public.cancel_managed_cashout($1)',[id]);q=await quote(db,20000);assert.equal(q.availableGrossCents,60000);assert.equal(q.preview.serviceFeeCents,1200);
  await db.exec('reset role');const dates=(await db.query<{d:number}>('select extract(epoch from(processing_to-processing_from))/86400 d from private.managed_cashouts')).rows[0];assert.equal(Number(dates.d),2);
  assert.equal((await db.query<{v:number}>("select (snapshot->>'commissionCents')::integer v from private.seller_statements where wallet_id=$1",[first.w])).rows[0].v,null);
  assert.ok(second.w);
 }finally{await db.close();}
});
test('other owners, personal sales and arbitrary wallet credits cannot fund managed cash-outs; reversals release holds',async()=>{
 const db=await setup();try{
  const {w}=await addSale(db,0,20000);await db.exec("update private.managed_sale_releases set available_at=now()-interval '1 second'");await identity(db,seller);const id=randomUUID();await db.query('select public.request_managed_cashout($1,20000,10000,1200,8800)',[id]);
  await identity(db,other);assert.equal((await quote(db,20000)).availableGrossCents,0);await assert.rejects(db.query('select public.cancel_managed_cashout($1)',[id]),/cannot/);await assert.rejects(db.query('select * from private.managed_cashouts'),/permission denied/);await assert.rejects(db.query('select public.admin_managed_cashouts()'),/MFA/);
  await identity(db,'','anon');await assert.rejects(db.query('select public.my_managed_cashouts()'),/permission denied/);
  await db.exec('reset role');await db.query("update wallet_transactions set status='reversed' where id=$1",[w]);assert.equal((await db.query<{status:string}>('select status from private.managed_cashouts where id=$1',[id])).rows[0].status,'invalidated');
  await db.query("insert into wallet_transactions(user_id,item_id,amount_cents,transaction_type,status) values($1,$2,99999,'sale_credit','completed')",[seller,ids[1]]);await identity(db,seller);assert.equal((await quote(db,100)).availableGrossCents,0);
  await assert.rejects(db.query("insert into wallet_transactions(user_id,item_id,amount_cents,transaction_type,status) values($1,$2,1000,'payout_debit','completed')",[seller,ids[0]]));
 }finally{await db.close();}
});
test('verified payment preserves platform-funded discounts, credits gross without item commission and invalidates cash-out on refund',async()=>{
 const db=await setup();try{
  await enable(db);await identity(db,buyer);const eligible=await offer(db);const order=await prepare(db,eligible.code);const a=await attempt(db,order);
  const batch=randomUUID();await db.exec('reset role');await db.query('insert into collection_requests(id,user_id) values($1,$2)',[batch,seller]);await db.query('update items set collection_request_id=$1 where id=any($2::uuid[])',[batch,ids.slice(0,2)]);
  await identity(db,buyer,'service_role');await db.query("select public.accept_verified_buyer_payment($1,'cashout-event','cashout-payment',repeat('a',64),$2,'CAD',true)",[a.id,a.amount]);
  await db.exec('reset role');
  const lines=(await db.query<{seller_cents:number;expected:number}>('select c.seller_cents,oi.unit_price_cents expected from order_seller_credits c join order_items oi on oi.id=c.order_item_id where c.order_id=$1',[order])).rows;
  assert.equal(lines.length,2);for(const line of lines)assert.equal(line.seller_cents,line.expected);
  await db.exec("update private.managed_sale_releases set available_at=now()-interval '1 second'");
  assert.equal((await db.query<{status:string}>("select status from wallet_transactions where transaction_type='sale_credit' limit 1")).rows[0].status,'pending');
  await identity(db,seller);const q=await quote(db,6000);assert.equal(q.availableGrossCents,6000);assert.equal(q.preview.commissionCents,3300);const id=randomUUID();await db.query('select public.request_managed_cashout($1,6000,3300,1200,1500)',[id]);
  await db.exec('reset role');await db.query("update orders set payment_status='refunded' where id=$1",[order]);
  assert.equal((await db.query<{status:string}>('select status from private.managed_cashouts where id=$1',[id])).rows[0].status,'invalidated');await identity(db,seller);assert.equal((await quote(db,100)).availableGrossCents,0);

 }finally{await db.close();}
});

test('manual verified sale also credits gross once and records deferred commission',async()=>{
 const db=await setup();try{
  await identity(db,staff);const result=(await db.query<{v:string}>("select public.admin_record_item_sale($1,800,'manual-cashout') v",[ids[0]])).rows[0].v;
  assert.equal((await db.query<{v:string}>("select public.admin_record_item_sale($1,800,'manual-cashout') v",[ids[0]])).rows[0].v,result);
  await db.exec('reset role');const row=(await db.query<{amount_cents:number;commission_snapshot:{settlementBasis:string}}> ('select amount_cents,commission_snapshot from wallet_transactions where id=$1',[result])).rows[0];assert.equal(row.amount_cents,800);assert.equal(row.commission_snapshot.settlementBasis,'cashout_v1');assert.equal((await db.query('select * from private.managed_sale_releases')).rows.length,1);
  await identity(db,other);await assert.rejects(db.query("select public.admin_record_item_sale($1,5200,'manual-other')",[ids[1]]),/MFA/);
 }finally{await db.close();}
});
