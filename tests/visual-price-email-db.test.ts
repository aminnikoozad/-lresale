import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pricingFixture,newItem} from './fixtures/pricing-db.ts';
import {identity,staff,seller} from './fixtures/buyer-sales-db.ts';
import {estimateVisual} from '../lib/pricing/visual.ts';
const migration=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const item='91000000-0000-4000-8000-000000000001';
type DB=Awaited<ReturnType<typeof pricingFixture>>;
async function fixture(){const db=await pricingFixture(false);await db.exec(`
 alter table auth.users add column email text,add column email_confirmed_at timestamptz;
 update auth.users set email='admin@example.test',email_confirmed_at=now() where id='${staff}';
 alter table public.items add column sale_mode text not null default 'managed_consignment';
 create table private.marketplace_photo_assets(id uuid,item_id uuid,role text,storage_key text,provider text,withdrawn_at timestamptz,created_at timestamptz default now());
 create schema net;create schema vault;create schema cron;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values('shikimomo_pickup_resend','fixture-only-key');
 create table net._http_response(id bigint,status_code integer,content text);
 create table net.sent_requests(id bigserial,url text,headers jsonb,body jsonb);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into net.sent_requests(url,headers,body) values(url,headers,body) returning id$$;
 create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
 `);await db.exec(migration('20261024041120_automatic_visual_pricing'));await db.exec(migration('20261024042315_visual_price_review_email'));await db.exec(migration('20261024044040_visual_review_audit_fixes'));await newItem(db,item);return db;}
async function subscribe(db:DB){await identity(db,staff);await db.query('select public.admin_set_visual_price_email(true)');}
async function complete(db:DB,priced=true){await identity(db,staff);const control=(await db.query<{v:{enabled:boolean;version:number}}>('select public.admin_visual_pricing_queue() v')).rows[0].v;if(!control.enabled)await db.query("select public.admin_set_visual_pricing($1,true,'Enable visual search for isolated email test')",[control.version]);
 await db.exec("reset role;update private.visual_pricing_jobs set available_at=now()-interval '1 minute'");await identity(db,staff,'service_role');const job=(await db.query<{v:{id:string;token:string}}>('select public.claim_visual_pricing_job() v')).rows[0].v;
 const result=estimateVisual({visual_matches:priced?[{title:'Shirt',link:'https://shop.example/shirt',price:{extracted_value:25,currency:'CAD'}}]:[]},null);
 await db.query('select public.finish_visual_pricing_job($1,$2,$3::jsonb)',[job.id,job.token,JSON.stringify(result)]);await db.exec('reset role');return job;}
const count=async(db:DB,table:string)=>(await db.query<{n:number}>(`select count(*)::integer n from ${table}`)).rows[0].n;
test('verified owner opts in; completion queues one email with price, escaped title and exact item link; duplicate event is deduplicated',async()=>{
 const db=await fixture();try{
 await db.exec('reset role');await db.query("update public.items set name=$1 where id=$2",['<script>alert(1)</script>\nShirt',item]);
 await subscribe(db);const job=await complete(db);
 const mail=(await db.query<{payload:{to:string[];subject:string;text:string;html:string}}>('select payload from private.visual_price_email_jobs')).rows[0].payload;
 assert.deepEqual(mail.to,['admin@example.test']);assert.match(mail.text,/25.00 CAD/);assert.ok(mail.text.includes(`?item=${item}`));assert.ok(mail.html.includes('&lt;script&gt;'));assert.ok(!mail.html.includes('<script>'));assert.ok(!mail.subject.includes('\n'));
 await db.query('select private.queue_visual_price_emails($1)',[job.id]);assert.equal(await count(db,'private.visual_price_email_jobs'),1);
 await identity(db,staff);const selected=(await db.query<{v:{id:string}}>('select public.admin_visual_pricing_item($1) v',[item])).rows[0].v;assert.equal(selected.id,item);
 await db.exec('reset role');await db.query('select private.dispatch_visual_price_emails()');assert.equal(await count(db,'net.sent_requests'),1);
 const first=(await db.query<{id:number;headers:Record<string,string>}>('select id,headers from net.sent_requests')).rows[0];
 await db.query('insert into net._http_response values($1,200,$2)',[first.id,JSON.stringify({id:'fixture-provider-id'})]);await db.query('select private.dispatch_visual_price_emails()');
 const accepted=(await db.query<{status:string;provider_id:string;payload:unknown}>('select status,provider_id,payload from private.visual_price_email_jobs')).rows[0];assert.equal(accepted.status,'accepted');assert.equal(accepted.provider_id,'fixture-provider-id');assert.deepEqual(accepted.payload,{});assert.equal(await count(db,'net.sent_requests'),1);
 }finally{await db.close();}
});
test('no-price results and unsubscribed accounts produce no email; preferences and private outbox require owner MFA',async()=>{
 const db=await fixture();try{
 for(const [uid,aal] of [[seller,'aal2'],[staff,'aal1']]){await identity(db,uid,'authenticated',aal);await assert.rejects(db.query('select public.admin_set_visual_price_email(true)'),/MFA/);await assert.rejects(db.query('select public.admin_visual_price_email_preferences()'),/MFA/);await assert.rejects(db.query('select * from private.visual_price_email_jobs'));}
 await complete(db);assert.equal(await count(db,'private.visual_price_email_jobs'),0);
 await subscribe(db);await db.exec('reset role');assert.equal(await count(db,'private.visual_price_email_jobs'),1);
 // Already completed priced item was backfilled on explicit subscription. Remove only the isolated test's pending row.
 await db.exec('delete from private.visual_price_email_jobs');await db.query("update public.items set name='No priced comparison' where id=$1",[item]);await complete(db,false);assert.equal(await count(db,'private.visual_price_email_jobs'),0);
 await db.exec(`update auth.users set email_confirmed_at=null where id='${staff}'`);await identity(db,staff);await assert.rejects(db.query('select public.admin_set_visual_price_email(true)'),/Verified email/);
 }finally{await db.close();}
});
test('retries retain identical idempotency key/payload and stop inside the 24-hour window; permanent errors do not retry',async()=>{
 const db=await fixture();try{
 await subscribe(db);await complete(db);await db.query('select private.dispatch_visual_price_emails()');
 const first=(await db.query<{id:number;body:unknown;headers:Record<string,string>}>('select * from net.sent_requests')).rows[0];
 await db.query('insert into net._http_response values($1,429,$2)',[first.id,'{}']);await db.query('select private.dispatch_visual_price_emails()');await db.exec("update private.visual_price_email_jobs set next_attempt_at=now()-interval '1 minute'");await db.query('select private.dispatch_visual_price_emails()');
 const second=(await db.query<typeof first>('select * from net.sent_requests order by id desc limit 1')).rows[0];assert.equal(second.headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.deepEqual(second.body,first.body);
 await db.query('insert into net._http_response values($1,403,$2)',[second.id,'{}']);await db.query('select private.dispatch_visual_price_emails()');assert.equal((await db.query<{status:string}>('select status from private.visual_price_email_jobs')).rows[0].status,'failed');
 await db.exec("update private.visual_price_email_jobs set status='pending',created_at=now()-interval '23 hours 1 minute',next_attempt_at=now()-interval '1 minute'");await db.query('select private.dispatch_visual_price_emails()');assert.equal(await count(db,'net.sent_requests'),2);
 }finally{await db.close();}
});
test('reviewed/changed clothing and disabled subscriptions cancel unsent alerts; missing email credentials do not damage pricing results',async()=>{
 const db=await fixture();try{
 await subscribe(db);const job=await complete(db);await db.exec('delete from vault.decrypted_secrets');await db.query('select private.dispatch_visual_price_emails()');assert.equal(await count(db,'net.sent_requests'),0);
 await identity(db,staff);await db.query('select public.admin_review_visual_price($1,2500,$2)',[job.id,'Inspected garment and comparable evidence reviewed']);await db.exec('reset role');await db.query('select private.dispatch_visual_price_emails()');assert.equal((await db.query<{status:string}>('select status from private.visual_price_email_jobs')).rows[0].status,'cancelled');
 await identity(db,staff);await db.query('select public.admin_set_visual_price_email(false)');const pref=(await db.query<{v:{enabled:boolean}}>('select public.admin_visual_price_email_preferences() v')).rows[0].v;assert.equal(pref.enabled,false);
 await db.exec('reset role');assert.equal((await db.query<{status:string}>('select status from private.visual_pricing_jobs where id=$1',[job.id])).rows[0].status,'completed');
 }finally{await db.close();}
});
test('approval from the existing item-pricing workspace cancels the waiting email',async()=>{
 const db=await fixture();try{
 await subscribe(db);await complete(db);await identity(db,staff);
 const snapshot=(await db.query<{v:{snapshot:string}}>('select public.admin_pricing_workspace($1) v',[item])).rows[0].v.snapshot;
 await db.query('select public.admin_approve_item_price($1,$2,2500,$3,null)',[item,snapshot,'Price approved through the existing item-pricing workspace']);
 await db.exec('reset role');await db.query('select private.dispatch_visual_price_emails()');
 assert.equal(await count(db,'net.sent_requests'),0);
 assert.equal((await db.query<{status:string}>('select status from private.visual_price_email_jobs')).rows[0].status,'cancelled');
 }finally{await db.close();}
});

test('a newer unchanged-photo analysis cancels an older pending email instead of sending stale duplicate alerts',async()=>{
 const db=await fixture();try{
 await subscribe(db);const old=await complete(db);
 await db.query("insert into private.visual_pricing_jobs(item_id,fingerprint,cache_day,created_at) select item_id,fingerprint,cache_day+1,created_at+interval '1 second' from private.visual_pricing_jobs where id=$1",[old.id]);
 await db.query('select private.dispatch_visual_price_emails()');
 assert.equal(await count(db,'net.sent_requests'),0);
 assert.equal((await db.query<{status:string}>('select status from private.visual_price_email_jobs')).rows[0].status,'cancelled');
 await db.exec('delete from private.visual_price_email_jobs');await db.query('select private.queue_visual_price_emails($1)',[old.id]);
 assert.equal(await count(db,'private.visual_price_email_jobs'),0);
 }finally{await db.close();}
});
test('an exhausted queued attempt becomes a visible failure and can be explicitly retried',async()=>{
 const db=await fixture();try{
 await complete(db);await db.query("update private.visual_pricing_jobs set status='queued',attempts=2,result=null,available_at=now()-interval '1 minute' where item_id=$1 and status='completed'",[item]);
 await identity(db,staff,'service_role');assert.equal((await db.query<{v:unknown}>('select public.claim_visual_pricing_job() v')).rows[0].v,null);
 await db.exec('reset role');assert.equal((await db.query<{status:string}>("select status from private.visual_pricing_jobs where item_id=$1 and attempts=2",[item])).rows[0].status,'failed');
 await identity(db,staff);await db.query('select public.admin_request_visual_pricing($1)',[item]);await db.exec('reset role');
 assert.equal((await db.query<{attempts:number}>("select attempts from private.visual_pricing_jobs where item_id=$1 and status='queued'",[item])).rows[0].attempts,0);
 }finally{await db.close();}
});
