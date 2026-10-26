import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketplaceFixture} from './fixtures/marketplace-db.ts';
import {identity,seller,other,ids,buyer,enable,offer,prepare,attempt} from './fixtures/buyer-sales-db.ts';
const sql=(n:string)=>readFileSync(new URL(`../supabase/migrations/${n}.sql`,import.meta.url),'utf8');
async function setup(){const db=await marketplaceFixture();await db.exec(sql('20261021114432_marketplace_community_trading'));await db.exec(`
 alter table auth.users add column email text,add column email_confirmed_at timestamptz;
 update auth.users set email='seller@example.test',email_confirmed_at=now() where id='${seller}';
 create table public.item_sale_records(item_id uuid primary key,seller_id uuid,recorded_by uuid,reference text unique,sale_cents integer,seller_bps integer,seller_cents integer,wallet_id uuid unique,created_at timestamptz default now());
 create schema net;create schema vault;create schema cron;
 create table vault.decrypted_secrets(name text,decrypted_secret text);insert into vault.decrypted_secrets values('shikimomo_pickup_resend','fixture-only-key');
 create table net._http_response(id bigint,status_code integer,content text);
 create table net.sent_requests(id bigserial,url text,headers jsonb,body jsonb);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into net.sent_requests(url,headers,body) values(url,headers,body) returning id$$;
 create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
 create function private.pilot_category_active(text) returns boolean language sql as $$select true$$;
 `);await db.exec(sql('20261026051515_separate_seller_ledgers_and_direct_publication'));await db.exec(sql('20261026114342_automatic_seller_statements'));return db;}
async function sale(db:Awaited<ReturnType<typeof setup>>){await db.exec('reset role');const w=(await db.query<{id:string}>("insert into public.wallet_transactions(user_id,item_id,amount_cents,transaction_type,status,description) values($1,$2,480,'sale_credit','pending','Synthetic sale credit') returning id",[seller,ids[0]])).rows[0].id;await db.query('insert into public.item_sale_records(item_id,seller_id,sale_cents,seller_bps,seller_cents,wallet_id,reference) values($1,$2,800,6000,480,$3::uuid,$3::text)',[ids[0],seller,w]);return w;}
test('verified sale creates one immutable snapshot, separate selling mode and owner-only statement; arbitrary credits never create invoices',async()=>{
 const db=await setup();try{
  const wallet=await sale(db);await db.query("select private.issue_seller_statement($1,'sale_recorded')",[wallet]);
  const row=(await db.query<{id:string;sale_mode:string;snapshot:{grossCents:number;commissionCents:number;sellerCents:number;bankTransferConfirmed:boolean}}>('select * from private.seller_statements')).rows[0];assert.equal((await db.query('select * from private.seller_statements')).rows.length,1);assert.equal(row.sale_mode,'managed_consignment');assert.equal(row.snapshot.grossCents,800);assert.equal(row.snapshot.commissionCents,320);assert.equal(row.snapshot.sellerCents,480);assert.equal(row.snapshot.bankTransferConfirmed,false);
  await db.query("update public.items set name='Changed title' where id=$1",[ids[0]]);assert.deepEqual((await db.query('select snapshot from private.seller_statements')).rows[0].snapshot,row.snapshot);
  await identity(db,seller);assert.equal((await db.query<{v:unknown[]}>('select public.my_seller_statements() v')).rows[0].v.length,1);await assert.rejects(db.query('select * from private.seller_statements'),/permission denied/);
  await identity(db,other);assert.deepEqual((await db.query<{v:unknown[]}>('select public.my_seller_statements($1) v',[row.id])).rows[0].v,[]);
  await identity(db,'','anon');await assert.rejects(db.query('select public.my_seller_statements()'),/permission denied/);
  await db.exec('reset role');const unsupported=(await db.query<{id:string}>("insert into public.wallet_transactions(user_id,item_id,amount_cents,transaction_type,status,description) values($1,$2,100,'sale_credit','pending','No sale evidence') returning id",[seller,ids[1]])).rows[0].id;await db.query("select private.issue_seller_statement($1,'sale_recorded')",[unsupported]);assert.equal((await db.query('select * from private.seller_statements')).rows.length,1);
 }finally{await db.close();}
});
test('email goes only to verified owner, uses stable idempotency on retry and records provider acceptance, not bank payment',async()=>{
 const db=await setup();try{
  await sale(db);await db.query('select private.dispatch_seller_statement_emails()');
  const first=(await db.query<{id:number;headers:Record<string,string>;body:{to:string[];text:string}}>('select * from net.sent_requests')).rows[0];assert.deepEqual(first.body.to,['seller@example.test']);assert.match(first.body.text,/4.80 CAD/);assert.match(first.body.text,/not money transferred to your bank/);assert.match(first.body.text,/account\/seller\/statements\//);
  await db.query("insert into net._http_response values($1,429,'{}')",[first.id]);await db.query('select private.dispatch_seller_statement_emails()');await db.exec("update private.seller_statement_emails set next_attempt_at=now()-interval '1 minute'");await db.query('select private.dispatch_seller_statement_emails()');
  const second=(await db.query<typeof first>('select * from net.sent_requests order by id desc limit 1')).rows[0];assert.equal(second.headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.deepEqual(second.body,first.body);
  await db.query('insert into net._http_response values($1,200,$2)',[second.id,JSON.stringify({id:'fixture-provider-id'})]);await db.query('select private.dispatch_seller_statement_emails()');const job=(await db.query<{status:string;payload:unknown}>('select * from private.seller_statement_emails')).rows[0];assert.equal(job.status,'accepted');assert.equal(job.payload,null);
 }finally{await db.close();}
});
test('unverified email waits; reversals cancel stale unsent statements and create one correction notice without fabricating payouts',async()=>{
 const db=await setup();try{
  const wallet=await sale(db);await db.query('update auth.users set email_confirmed_at=null where id=$1',[seller]);await db.query('select private.dispatch_seller_statement_emails()');assert.equal((await db.query('select * from net.sent_requests')).rows.length,0);
  await db.query("update public.wallet_transactions set status='reversed' where id=$1",[wallet]);await db.query("select private.issue_seller_statement($1,'sale_reversed')",[wallet]);
  assert.equal((await db.query('select * from private.seller_statements')).rows.length,2);await db.query('update auth.users set email_confirmed_at=now() where id=$1',[seller]);await db.query('select private.dispatch_seller_statement_emails()');
  const mail=(await db.query<{body:{text:string}}>('select body from net.sent_requests')).rows[0];assert.match(mail.body.text,/Sale reversed/);assert.equal((await db.query("select * from private.seller_statement_emails where status='cancelled'")).rows.length,1);
  await identity(db,seller);const docs=(await db.query<{v:Array<{reversed:boolean}>}>('select public.my_seller_statements() v')).rows[0].v;assert.ok(docs.every(s=>s.reversed));
 }finally{await db.close();}
});
test('verified online payment automatically creates statements once; awaiting or duplicate payments do not',async()=>{
 const db=await setup();try{
  await enable(db);await identity(db,buyer);const code=await offer(db);const order=await prepare(db,code.code);const payment=await attempt(db,order);
  assert.equal((await db.query('select * from private.seller_statements')).rows.length,0);
  await identity(db,buyer,'service_role');
  await db.query("select public.accept_verified_buyer_payment($1,'statement-event','statement-payment',repeat('a',64),$2,'CAD',true)",[payment.id,payment.amount]);
  await db.query("select public.accept_verified_buyer_payment($1,'statement-event','statement-payment',repeat('a',64),$2,'CAD',true)",[payment.id,payment.amount]);
  await db.exec('reset role');const statements=(await db.query<{snapshot:{bankTransferConfirmed:boolean};event:string}>('select * from private.seller_statements')).rows;
  assert.equal(statements.length,2);assert.ok(statements.every(s=>s.event==='sale_recorded'&&!s.snapshot.bankTransferConfirmed));
 }finally{await db.close();}
});
