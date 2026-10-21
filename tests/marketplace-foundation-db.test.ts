import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture as buyerFixture, identity, seller, other, staff, ids} from './fixtures/buyer-sales-db.ts';
const sql=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
async function fixture(){
 const db=await buyerFixture();
 await db.exec(`alter table public.items add column collection_request_id uuid,add column pricing_authority text not null default 'seller',add column locked_commission_rule_version integer,add column locked_commission_tier jsonb,add column seller_disposition_preference text;
 alter table public.items alter column id set default gen_random_uuid();
 alter table public.items alter column inspected_at drop default,alter column published_at drop default,alter column seller_pricing_approved_at drop default,alter column locked_seller_commission_bps drop default,alter column locked_platform_commission_bps drop default;
 create table public.item_rule_overrides(item_id uuid,override_type text);
 create table public.business_setting_versions(setting_key text,version integer,value jsonb,reason text,unique(setting_key,version));
 create function public.get_selling_rules() returns jsonb language sql as $$select '{"sellingPeriodDays":90,"minimumIndividualItemValueCents":800}'::jsonb$$;
 create function private.has_team_pricing_mandate(uuid) returns boolean language sql as $$select false$$;
 create function private.current_commission_resolution(integer) returns table(rule_version integer,tier jsonb,seller_bps integer,platform_bps integer) language sql as $$select 1,'{}'::jsonb,6000,4000$$;
 alter table public.items enable row level security;grant select on public.items to authenticated;
 create policy own_items on public.items for select to authenticated using(owner_id=auth.uid());
 `);
 // Execute the real existing commission, inspection, and warehouse-sync functions.
 const team=sql('20261015175400_team_managed_pricing');
 await db.exec(team.slice(team.indexOf('create or replace function private.guard_item_commission()'),team.indexOf('create or replace function private.guard_bundle_commission()')));
 await db.exec('create trigger items_guard_commission before insert or update on public.items for each row execute function private.guard_item_commission()');
 await db.exec(sql('20261002010000_item_inspection_publication_gate'));
 const ops=sql('20260924193000_sellpy_ops_v1');
 await db.exec(ops.slice(ops.indexOf('create sequence'),ops.indexOf('insert into public.item_operations(item_id,stage')));
 await db.exec(sql('20261020184751_hybrid_sale_mode_foundation'));
 await db.exec("alter table public.items alter column photo_urls set default '{}'::text[]");
 const taxonomy=sql('20260921170708_catalog_taxonomy_foundation_v2');
 await db.exec(taxonomy.slice(taxonomy.indexOf('create or replace function public.is_valid_catalog_subcategory'),taxonomy.indexOf('alter table public.collection_requests drop constraint')));
 await db.exec(sql('20261021014818_marketplace_draft_lifecycle'));
 return db;
}
const fields={name:'Blue shirt',category:'women',brand_kind:'unknown',description:'Real shirt',price_cents:4000};
test('direct drafts use existing inventory without a Bag, inspection, commission lock or warehouse enrollment',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[fields])).rows[0].v;
 assert.ok(saved.id);
 const own=(await db.query<{v:Array<{id:string;listing_version:number;name:string}>}>('select public.my_marketplace_drafts() v')).rows[0].v;
 assert.equal(own.length,1);assert.equal(own[0].id,saved.id);
 await db.exec('reset role');
 const row=(await db.query<{sale_mode:string;physical_custody:string;shipping_responsibility:string;collection_request_id:null;inspected_at:null;seller_pricing_approved_at:null}>('select * from public.items where id=$1',[saved.id])).rows[0];
 assert.equal(row.sale_mode,'peer_to_peer');assert.equal(row.physical_custody,'seller');assert.equal(row.shipping_responsibility,'seller');
 assert.equal(row.collection_request_id,null);assert.equal(row.inspected_at,null);assert.equal(row.seller_pricing_approved_at,null);
 assert.equal((await db.query('select * from public.item_operations where item_id=$1',[saved.id])).rows.length,0);
 assert.equal((await db.query<{sale_mode:string}>('select sale_mode from public.items where id=$1',[ids[0]])).rows[0].sale_mode,'managed_consignment');
 await assert.rejects(db.query('insert into public.item_operations(item_id) values($1)',[saved.id]),/Managed operations/);
 }finally{await db.close();}
});

test('archive and restore invalidate old forms; copies are independent, idempotent, and preserve descriptive measurements only',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 const sourceFields={...fields,subcategory:'Shirts & Blouses',measurements:{chest:51.5,length:70},label_absent:true};
 const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[sourceFields])).rows[0].v;
 const act=async(id:string,version:number,op:string,request:string)=>(await db.query<{v:{id:string;version:number;status:string}}>('select public.manage_marketplace_draft($1,$2,$3,$4) v',[id,version,op,request])).rows[0].v;
 const archived=await act(saved.id,saved.version,'archive','30000000-0000-4000-8000-000000000001');
 assert.equal(archived.status,'archived');assert.equal(archived.version,saved.version+1);
 await assert.rejects(db.query('select public.save_marketplace_draft($1,$2,$3)',[saved.id,saved.version,sourceFields]),/changed/);
 const restored=await act(saved.id,archived.version,'restore','30000000-0000-4000-8000-000000000002');
 assert.equal(restored.status,'listing_preparation');assert.equal(restored.version,archived.version+1);
 const copy=await act(saved.id,restored.version,'copy','30000000-0000-4000-8000-000000000003');
 assert.notEqual(copy.id,saved.id);
 assert.deepEqual(await act(saved.id,restored.version,'copy','30000000-0000-4000-8000-000000000003'),copy);
 await assert.rejects(act(saved.id,restored.version,'archive','30000000-0000-4000-8000-000000000003'),/identifier/);
 await db.exec('reset role');
 const cloned=(await db.query<{photo_urls:string[];marketplace_details:{measurements:{chest:number}};inspected_at:null;sold_price_cents:null;collection_request_id:null}>('select * from public.items where id=$1',[copy.id])).rows[0];
 assert.deepEqual(cloned.photo_urls,[]);assert.equal(cloned.marketplace_details.measurements.chest,51.5);
 assert.equal(cloned.inspected_at,null);assert.equal(cloned.sold_price_cents,null);assert.equal(cloned.collection_request_id,null);
 assert.equal((await db.query("select * from public.audit_logs where action='marketplace.draft_action'")).rows.length,3);
 }finally{await db.close();}
});

test('sold-elsewhere is a closure declaration, never an on-platform sale or seller credit',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[fields])).rows[0].v;
 const result=(await db.query<{v:{version:number;status:string;closureReason:string}}>("select public.manage_marketplace_draft($1,$2,'sold_elsewhere',gen_random_uuid()) v",[saved.id,saved.version])).rows[0].v;
 assert.equal(result.status,'archived');assert.equal(result.closureReason,'sold_elsewhere');
 await assert.rejects(db.query("select public.manage_marketplace_draft($1,$2,'restore',gen_random_uuid())",[saved.id,result.version]),/unsold/);
 await db.exec('reset role');
 assert.equal((await db.query('select * from public.wallet_transactions')).rows.length,0);
 assert.equal((await db.query('select * from public.orders')).rows.length,0);
 assert.equal((await db.query<{sold_price_cents:null}>('select sold_price_cents from public.items where id=$1',[saved.id])).rows[0].sold_price_cents,null);
 }finally{await db.close();}
});

test('listing management denies cross-seller, staff, anonymous, stale, managed and reserved inventory operations',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[fields])).rows[0].v;
 const act=(id=saved.id,version=saved.version,op='archive')=>db.query('select public.manage_marketplace_draft($1,$2,$3,gen_random_uuid())',[id,version,op]);
 await assert.rejects(act(ids[0]),/unavailable/);
 await assert.rejects(act(saved.id,0),/Invalid/);
 await assert.rejects(act(saved.id,saved.version,'publish'),/Invalid/);
 await assert.rejects(act(saved.id,saved.version+1),/changed/);
 for(const actor of [other,staff]){await identity(db,actor);await assert.rejects(act(),/unavailable/);}
 await db.exec('reset role;set role anon');await assert.rejects(act(),/permission denied/);
 await identity(db,seller);await db.exec('reset role');
 await db.query("insert into public.inventory_reservations(item_id,status,expires_at) values($1,'active',now()+interval '15 minutes')",[saved.id]);
 await identity(db,seller);
 for(const op of ['archive','restore','copy','sold_elsewhere']) await assert.rejects(act(saved.id,saved.version,op),/locked/);
 }finally{await db.close();}
});

test('order history locks every listing-management action, and restore cannot bypass the active-draft cap',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[fields])).rows[0].v;
 await db.exec('reset role');
 const order=(await db.query<{id:string}>('insert into public.orders(buyer_id,status) values($1,\'cancelled\') returning id',[other])).rows[0].id;
 await db.query('insert into public.order_items(order_id,item_id) values($1,$2)',[order,saved.id]);
 await identity(db,seller);
 for(const op of ['archive','restore','copy','sold_elsewhere']) await assert.rejects(db.query('select public.manage_marketplace_draft($1,$2,$3,gen_random_uuid())',[saved.id,saved.version,op]),/locked/);
 const fresh=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[fields])).rows[0].v;
 const archived=(await db.query<{v:{version:number}}>("select public.manage_marketplace_draft($1,$2,'archive',gen_random_uuid()) v",[fresh.id,fresh.version])).rows[0].v;
 await db.exec('reset role');
 await db.query("insert into public.items(owner_id,name,category,sale_mode,physical_custody,shipping_responsibility,status) select $1,'Cap test','women','peer_to_peer','seller','seller','listing_preparation' from generate_series(1,199)",[seller]);
 await identity(db,seller);
 await assert.rejects(db.query("select public.manage_marketplace_draft($1,$2,'restore',gen_random_uuid())",[fresh.id,archived.version]),/limit/);
 }finally{await db.close();}
});
test('RLS, RPC ownership, optimistic versions and payload allowlists deny cross-account writes and reads',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[fields])).rows[0].v;
 await assert.rejects(db.query('update public.items set listed_price_cents=1 where id=$1',[saved.id]),/permission denied/);
 await assert.rejects(db.query('select public.save_marketplace_draft($1,$2,$3)',[saved.id,saved.version,{...fields,sale_mode:'managed_consignment'}]),/Unsupported/);
 await db.query('select public.save_marketplace_draft($1,$2,$3)',[saved.id,saved.version,{...fields,name:'Changed shirt'}]);
 await assert.rejects(db.query('select public.save_marketplace_draft($1,$2,$3)',[saved.id,saved.version,fields]),/Draft changed/);
 await identity(db,other);
 assert.equal((await db.query('select * from public.items where id=$1',[saved.id])).rows.length,0);
 assert.deepEqual((await db.query<{v:unknown}>('select public.my_marketplace_drafts() v')).rows[0].v,[]);
 await assert.rejects(db.query('select public.save_marketplace_draft($1,$2,$3)',[saved.id,saved.version,fields]),/unavailable/);
 await identity(db,staff);
 await assert.rejects(db.query('select public.save_marketplace_draft($1,$2,$3)',[saved.id,saved.version,fields]),/unavailable/);
 await db.exec('reset role;set role anon');
 await assert.rejects(db.query('select public.my_marketplace_drafts()'),/permission denied/);
 await assert.rejects(db.query('select public.save_marketplace_draft(null,0,$1)',[fields]),/permission denied/);
 }finally{await db.close();}
});
test('legacy RPCs or privileged payloads cannot publish, inspect, convert or financially complete direct drafts',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[fields])).rows[0].v;
 // Owner JWT under table-owner SQL exercises the trigger, not just GRANT denial.
 await db.exec('reset role');
 for(const change of ["sale_mode='managed_consignment'",`owner_id='${other}'`,"physical_custody='team'","shipping_responsibility='team'","collection_request_id=gen_random_uuid()","inspected_at=now()","seller_pricing_approved_at=now()","initial_approved_price_cents=4000","status='listed'","status='sold'","published_at=now()","final_seller_earnings_cents=3400","locked_seller_commission_bps=8500"]){
  await assert.rejects(db.query(`update public.items set ${change} where id=$1`,[saved.id]),undefined,change);
 }
 await db.query('insert into public.inventory_reservations(item_id,status,expires_at) values($1,\'active\',now()+interval \'15 minutes\')',[saved.id]);
 await identity(db,seller);
 await assert.rejects(db.query('select public.save_marketplace_draft($1,$2,$3)',[saved.id,saved.version,{...fields,price_cents:5000}]),/locked/);
 await db.exec('reset role');
 assert.equal((await db.query('select * from public.wallet_transactions')).rows.length,0);
 }finally{await db.close();}
});
test('managed publication still requires inspection, immutable pricing locks and real clothing evidence',async()=>{
 const db=await fixture();try{
 await identity(db,seller);await db.exec('reset role');
 const id='20000000-0000-4000-8000-000000000001';
 await db.query(`insert into public.items(id,owner_id,name,status,inspected_at,published_at,first_published_at,seller_pricing_approved_at,initial_approved_price_cents,locked_seller_commission_bps,locked_platform_commission_bps) values($1,$2,'Managed shirt','accepted',null,null,null,null,4000,null,null)`,[id,seller]);
 assert.equal((await db.query('select * from public.item_operations where item_id=$1',[id])).rows.length,1);
 await assert.rejects(db.query("update public.items set status='listed' where id=$1",[id]),/approval|inspection/i);
 await identity(db,staff);
 await db.query('select public.admin_attest_item_inspection($1,$2)',[id,{clean:true,intact:true,suitable_for_resale:true,no_significant_damage:true,wearable_without_stains_tears_holes:true}]);
 await identity(db,seller);await db.exec('reset role');
 await db.query('update public.items set seller_pricing_approved_at=now() where id=$1',[id]);
 await assert.rejects(db.query('update public.items set locked_seller_commission_bps=9000 where id=$1',[id]),/locked/);
 await assert.rejects(db.query("update public.items set status='listed' where id=$1",[id]),/photos/);
 await db.query("update public.items set photo_urls=array['https://example.test/front','https://example.test/back','https://example.test/label'] where id=$1",[id]);
 await identity(db,staff);
 await db.query('select public.admin_save_clothing_evidence($1,$2,$3,$4)',[id,[{role:'front',url:'https://example.test/front'},{role:'back',url:'https://example.test/back'},{role:'size_label',url:'https://example.test/label'}],{},[]]);
 await db.exec('reset role');await db.query("update public.items set status='listed',published_at=now() where id=$1",[id]);
 }finally{await db.close();}
});
