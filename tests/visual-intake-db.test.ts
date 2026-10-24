import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pricingFixture,newItem} from './fixtures/pricing-db.ts';
import {identity,staff,seller} from './fixtures/buyer-sales-db.ts';
import {estimateVisual} from '../lib/pricing/visual.ts';
const sql=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const sha='a'.repeat(64),request='92000000-0000-4000-8000-000000000001',item='92000000-0000-4000-8000-000000000002';
type DB=Awaited<ReturnType<typeof pricingFixture>>;
async function fixture(){const db=await pricingFixture(false);await db.exec(`alter table public.items add column sale_mode text not null default 'managed_consignment';create table private.marketplace_photo_assets(id uuid,item_id uuid,role text,storage_key text,provider text,withdrawn_at timestamptz,created_at timestamptz default now());create schema if not exists storage;create table if not exists storage.objects(bucket_id text,name text);create function private.queue_visual_price_emails(uuid) returns void language sql as 'select';`);await db.exec(sql('20261024041120_automatic_visual_pricing'));await db.exec(sql('20261024200029_photo_first_visual_intake'));return db;}
async function enable(db:DB){await identity(db,staff);await db.query("select public.admin_set_visual_pricing(1,true,'Enable private intake test searches')");}
async function begin(db:DB){await identity(db,staff);return (await db.query<{v:{id:string;key:string;status:string}}>('select public.admin_begin_visual_intake($1,$2) v',[request,sha])).rows[0].v;}
async function queue(db:DB,id:string,key:string){await db.exec('reset role');await db.query("insert into storage.objects values('shikimomo-listing-photos',$1)",[key]);await identity(db,staff);await db.query('select public.admin_queue_visual_intake($1)',[id]);}
async function claim(db:DB,id:string){await identity(db,staff,'service_role');return (await db.query<{v:{id:string;token:string;kind:string}|null}>('select public.claim_visual_intake_job($1) v',[id])).rows[0].v;}
const estimate=JSON.stringify(estimateVisual({visual_matches:[{title:'Used jacket',link:'https://example.test/jacket',price:{extracted_value:40,currency:'CAD'}}]},null));
test('photo-first session requires MFA staff, reuses identical requests and does not create an item or price',async()=>{
 const db=await fixture();try{
  for(const [uid,aal] of [[seller,'aal2'],[staff,'aal1']]){await identity(db,uid,'authenticated',aal);await assert.rejects(db.query('select public.admin_begin_visual_intake($1,$2)',[request,sha]),/MFA/);}
  await db.exec('reset role');const initial=(await db.query<{n:number}>('select count(*)::int n from public.items')).rows[0].n;
  await enable(db);const a=await begin(db),b=await begin(db);assert.equal(a.id,b.id);assert.equal(a.status,'uploading');assert.match(a.key,/^visual-intake\//);
  await assert.rejects(db.query('select public.admin_begin_visual_intake($1,$2)',[request,'b'.repeat(64)]),/changed/);
  await assert.rejects(db.query('select public.admin_queue_visual_intake($1)',[a.id]),/not complete/);
  await assert.rejects(db.query('select * from private.visual_pricing_intakes'),/permission/);
  await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from public.items')).rows[0].n,initial);
 }finally{await db.close();}
});
test('one leased intake uses the shared provider budget, rejects stale finishes and links suggestions without approving prices',async()=>{
 const db=await fixture();try{
  await enable(db);const a=await begin(db);await queue(db,a.id,a.key);const j=await claim(db,a.id);assert.ok(j);assert.equal(j.kind,'intake');assert.equal(await claim(db,a.id),null);
  await assert.rejects(db.query('select public.finish_visual_intake_job($1,$2,$3::jsonb)',[a.id,request,estimate]),/lease/);
  await db.query('select public.finish_visual_intake_job($1,$2,$3::jsonb)',[a.id,j.token,estimate]);
  await identity(db,staff);const state=(await db.query<{v:{status:string;result:{suggestedCents:number}}}>('select public.admin_visual_intake_status($1) v',[a.id])).rows[0].v;assert.equal(state.status,'completed');assert.equal(state.result.suggestedCents,4000);
  await db.exec('reset role');await newItem(db,item);await identity(db,staff);
  await assert.rejects(db.query('select public.admin_attach_visual_intake($1,$2,$3)',[a.id,item,'b'.repeat(64)]),/changed/);
  await db.query('select public.admin_attach_visual_intake($1,$2,$3)',[a.id,item,sha]);await db.query('select public.admin_attach_visual_intake($1,$2,$3)',[a.id,item,sha]);
  await db.exec('reset role');const row=(await db.query<{result:{suggestedCents:number};approval:string|null}>('select j.result,i.pricing_approval_id approval from private.visual_pricing_jobs j join public.items i on i.id=j.item_id where i.id=$1 and j.status=\'completed\'',[item])).rows[0];assert.equal(row.result.suggestedCents,4000);assert.equal(row.approval,null);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from private.visual_pricing_calls')).rows[0].n,1);
 }finally{await db.close();}
});
test('pause revokes intake leases; other accounts cannot see the session; global cap stops additional searches',async()=>{
 const db=await fixture();try{
  await enable(db);const a=await begin(db);await queue(db,a.id,a.key);const j=await claim(db,a.id);assert.ok(j);
  await identity(db,seller);await assert.rejects(db.query('select public.admin_visual_intake_status($1)',[a.id]),/MFA/);
  await identity(db,staff);await db.query("select public.admin_set_visual_pricing(2,false,'Pause before releasing any results')");
  await identity(db,staff,'service_role');await assert.rejects(db.query('select public.finish_visual_intake_job($1,$2,$3::jsonb)',[a.id,j.token,estimate]),/paused/);
  await identity(db,staff);await db.query("select public.admin_set_visual_pricing(3,true,'Resume without accepting stale results')");
  await identity(db,staff,'service_role');await assert.rejects(db.query('select public.finish_visual_intake_job($1,$2,$3::jsonb)',[a.id,j.token,estimate]),/lease/);
  await db.exec('reset role');await db.query('insert into private.visual_pricing_calls(intake_id) select $1 from generate_series(1,200)',[a.id]);assert.equal(await claim(db,a.id),null);
 }finally{await db.close();}
});
