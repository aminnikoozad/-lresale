import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pricingFixture,newItem} from './fixtures/pricing-db.ts';
import {identity,staff,seller} from './fixtures/buyer-sales-db.ts';
import {estimateVisual} from '../lib/pricing/visual.ts';
const migration=readFileSync(new URL('../supabase/migrations/20261024041120_automatic_visual_pricing.sql',import.meta.url),'utf8');
const id='90000000-0000-4000-8000-000000000001';
type DB=Awaited<ReturnType<typeof pricingFixture>>;
type Job={id:string;token:string;image:{key?:string;provider?:string;url?:string}};
async function fixture(){const db=await pricingFixture(false);await db.exec(`alter table public.items add column sale_mode text not null default 'managed_consignment';create table private.marketplace_photo_assets(id uuid,item_id uuid,role text,storage_key text,provider text,withdrawn_at timestamptz,created_at timestamptz default now());`);await db.exec(migration);await newItem(db,id);return db;}
async function enable(db:DB){await identity(db,staff);await db.query("select public.admin_set_visual_pricing(1,true,'Enable visual searches for regression test')");}
async function claim(db:DB){await db.exec("reset role;update private.visual_pricing_jobs set available_at=now()-interval '1 minute'");await identity(db,staff,'service_role');return (await db.query<{v:Job|null}>('select public.claim_visual_pricing_job() v')).rows[0].v;}
const result=JSON.stringify(estimateVisual({visual_matches:[{title:'Used shirt',link:'https://shop.example/a',price:{extracted_value:20,currency:'CAD'},condition:'Used'}]},null));
test('uploads enqueue automatically while off; seller/AAL1/API callers cannot read, toggle, approve or run searches',async()=>{
 const db=await fixture();try{
 assert.equal(await claim(db),null);
 for(const [uid,aal] of [[seller,'aal2'],[staff,'aal1']]) {await identity(db,uid,'authenticated',aal);await assert.rejects(db.query('select public.admin_visual_pricing_queue()'),/MFA/);await assert.rejects(db.query("select public.admin_set_visual_pricing(1,true,'Unauthorized activation attempt')"),/MFA/);await assert.rejects(db.query('select public.claim_visual_pricing_job()'),/permission/);await assert.rejects(db.query('select public.admin_visual_pricing_photo($1)',[id]),/MFA/);}
 await enable(db);const job=await claim(db);assert.ok(job);assert.equal(job.image.url,'https://example.test/front');
 await identity(db,seller);await assert.rejects(db.query('select public.finish_visual_pricing_job($1,$2,$3::jsonb)',[job.id,job.token,result]),/permission/);
 await assert.rejects(db.query('select * from private.visual_pricing_jobs'));await assert.rejects(db.query('select public.admin_review_visual_price($1,2000,$2)',[job.id,'Unauthorized final approval attempt']),/MFA/);
 }finally{await db.close();}
});
test('changed photos revoke stale leases; completion and approval never change prices without admin review',async()=>{
 const db=await fixture();try{
 await enable(db);const first=(await claim(db))!;await db.exec('reset role');
 await db.query("update public.items set photo_urls=array['https://example.test/changed'] where id=$1",[id]);
 await identity(db,staff,'service_role');await assert.rejects(db.query('select public.finish_visual_pricing_job($1,$2,$3::jsonb)',[first.id,first.token,result]),/lease/);
 const job=(await claim(db))!;await db.query('select public.finish_visual_pricing_job($1,$2,$3::jsonb)',[job.id,job.token,result]);
 await db.exec('reset role');assert.equal((await db.query<{p:null}>('select listed_price_cents p from public.items where id=$1',[id])).rows[0].p,null);
 await identity(db,staff);await db.query('select public.admin_review_visual_price($1,2200,$2)',[job.id,'Visual matches and physical inspection reviewed']);
 await db.exec('reset role');const item=(await db.query<{p:number;status:string}>('select listed_price_cents p,status from public.items where id=$1',[id])).rows[0];assert.equal(item.p,2200);assert.notEqual(item.status,'listed');
 await assert.rejects(db.exec('delete from private.visual_pricing_reviews'),/append-only/);
 }finally{await db.close();}
});
test('private photos use registered storage keys; pause invalidates active worker; P2P price remains seller-owned',async()=>{
 const db=await fixture();try{
 await db.exec('reset role');await db.query("insert into private.marketplace_photo_assets(id,item_id,role,storage_key,provider) values($1,$2,'front','owner/item/photo.webp','supabase')",[id,id]);
 await db.query("update public.items set photo_urls=array[$1],sale_mode='peer_to_peer' where id=$2",['/api/marketplace/photos/'+id,id]);
 await enable(db);const first=(await claim(db))!;assert.equal(first.image.key,'owner/item/photo.webp');assert.equal(first.image.url,undefined);
 await identity(db,staff);await db.query("select public.admin_set_visual_pricing(2,false,'Pause searches during active request')");await identity(db,staff,'service_role');await assert.rejects(db.query('select public.finish_visual_pricing_job($1,$2,$3::jsonb)',[first.id,first.token,result]),/paused/);
 await identity(db,staff);await db.query("select public.admin_set_visual_pricing(3,true,'Resume controlled visual search tests')");
 const next=(await claim(db))!;await db.query('select public.finish_visual_pricing_job($1,$2,$3::jsonb)',[next.id,next.token,result]);
 await db.exec("reset role;update public.items set status='listing_preparation' where id='"+id+"'");
 await identity(db,staff);await db.query('select public.admin_review_visual_price($1,2500,$2)',[next.id,'P2P evidence reviewed without changing seller price']);
 await db.exec('reset role');assert.equal((await db.query<{p:null}>('select listed_price_cents p from public.items where id=$1',[id])).rows[0].p,null);
 }finally{await db.close();}
});
test('global monthly and hourly budgets are enforced in the database',async()=>{
 const db=await fixture();try{
 await enable(db);await db.exec("reset role;insert into private.visual_pricing_calls(job_id,reserved_at) select null,now() from generate_series(1,40)");assert.equal(await claim(db),null);
 await db.exec("reset role;update private.visual_pricing_calls set reserved_at=now()-interval '2 hours';insert into private.visual_pricing_calls(job_id,reserved_at) select null,date_trunc('month',now()) from generate_series(1,160)");assert.equal(await claim(db),null);
 }finally{await db.close();}
});
