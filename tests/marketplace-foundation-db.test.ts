import test from 'node:test';
import assert from 'node:assert/strict';
import {identity, seller, other, staff, ids} from './fixtures/buyer-sales-db.ts';
import {marketplaceFixture as fixture} from './fixtures/marketplace-db.ts';

const fields={name:'Blue shirt',category:'women',brand_kind:'unknown',description:'Real shirt',price_cents:4000};
const completeFields={...fields,description:'Actual synthetic shirt with clear details for testing.',item_condition:'Good'};
async function addPhoto(db:Awaited<ReturnType<typeof fixture>>,item:string,version:number,n:number,role:string,defect:string|null=null){
 const asset=`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.exec('reset role');
 const result=(await db.query<{v:{id:string;version:number}}>('select public.register_marketplace_photo($1,$2,$3,$4,$5,$6,$7,$8,$9,400,400,900) v',[item,seller,version,asset,role,defect,'neon_staging',`${seller}/${item}/${asset}.webp`,n.toString(16).padStart(64,'0')])).rows[0].v;
 await identity(db,seller);return result;
}

test('direct disclosure requires four distinct views, explicit label status and seller attestation without physical inspection',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 let saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[completeFields])).rows[0].v;
 const item=saved.id;
 const submit=(version=saved.version,noLabel=true)=>db.query("select public.submit_marketplace_evidence($1,$2,'no_known_flaws',$3,true)",[item,version,noLabel]);
 await assert.rejects(submit(),/photos required/);
 let n=0;for(const role of ['front','back','left','right']){saved=await addPhoto(db,item,saved.version,++n,role);}
 await assert.rejects(submit(saved.version,false),/Label photo required/);
 await assert.rejects(db.query("select public.submit_marketplace_evidence($1,$2,'no_known_flaws',true,false)",[item,saved.version]),/Confirm/);
 await submit();
 let own=(await db.query<{v:Array<{evidence_status:string;id:string}>}>('select public.my_marketplace_drafts() v')).rows[0].v;
 assert.equal(own.find(i=>i.id===item)?.evidence_status,'documented');
 await db.exec('reset role');
 const evidence=(await db.query<{evidence_source:string;label_absent:boolean}>('select evidence_source,label_absent from public.clothing_listing_evidence where item_id=$1',[item])).rows[0];
 assert.equal(evidence.evidence_source,'seller');assert.equal(evidence.label_absent,true);
 assert.equal((await db.query<{inspected_at:null}>('select inspected_at from public.items where id=$1',[item])).rows[0].inspected_at,null);
 await assert.rejects(db.query("update public.clothing_listing_evidence set evidence_source='team' where item_id=$1",[item]),/cannot claim team/);
 await identity(db,seller);
 await db.query('select public.withdraw_marketplace_photo($1,$2)',['90000000-0000-4000-8000-000000000004',saved.version]);
 own=(await db.query<{v:Array<{evidence_status:string;id:string}>}>('select public.my_marketplace_drafts() v')).rows[0].v;
 assert.equal(own.find(i=>i.id===item)?.evidence_status,'incomplete');
 }finally{await db.close();}
});

test('each declared defect needs a processed close-up and text; duplicate views, raw registration and cross-owner access are rejected',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 let saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[completeFields])).rows[0].v;const item=saved.id;
 await assert.rejects(db.query("select public.register_marketplace_photo(null,null,1,null,null,null,null,null,null,400,400,100)"),/permission denied/);
 let n=0;for(const role of ['front','back','left','right']) saved=await addPhoto(db,item,saved.version,++n,role);
 await assert.rejects(addPhoto(db,item,saved.version,5,'defect'),/check constraint/);
 saved=await addPhoto(db,item,saved.version,5,'defect','Small cuff stain');
 await assert.rejects(db.query("select public.submit_marketplace_evidence($1,$2,'no_known_flaws',true,true)",[item,saved.version]),/conflicting/);
 await assert.rejects(db.query("select public.submit_marketplace_evidence($1,$2,'has_flaws',true,true)",[item,saved.version]),/Each defect/);
 saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft($1,$2,$3) v',[item,saved.version,{...completeFields,condition_notes:'Small cuff stain'}])).rows[0].v;
 await db.query("select public.submit_marketplace_evidence($1,$2,'has_flaws',true,true)",[item,saved.version]);
 await identity(db,other);
 assert.equal((await db.query<{v:unknown}>("select public.my_marketplace_photo('90000000-0000-4000-8000-000000000005') v")).rows[0].v,null);
 await assert.rejects(db.query("select public.withdraw_marketplace_photo('90000000-0000-4000-8000-000000000005',$1)",[saved.version]),/unavailable/);
 await assert.rejects(db.query("select public.submit_marketplace_evidence($1,$2,'has_flaws',true,true)",[item,saved.version]),/Editable/);
 await db.exec('reset role');assert.equal((await db.query('select * from public.wallet_transactions')).rows.length,0);
 }finally{await db.close();}
});

test('public provenance hides private drafts and requires recorded team inspection rather than seller evidence',async()=>{
 const db=await fixture();try{
 await identity(db,seller);
 const direct=(await db.query<{v:{id:string}}>('select public.save_marketplace_draft(null,0,$1) v',[completeFields])).rows[0].v;
 assert.deepEqual((await db.query<{v:unknown}>('select public.catalog_sale_provenance($1) v',[[direct.id]])).rows[0].v,[]);
 // Existing seed inventory has publication metadata, but no physical-attestation audit.
 const result=(await db.query<{v:Array<{team_inspected:boolean;sale_mode:string}>}>('select public.catalog_sale_provenance($1) v',[[ids[0]]])).rows[0].v;
 assert.equal(result[0].sale_mode,'managed_consignment');assert.equal(result[0].team_inspected,false);
 }finally{await db.close();}
});
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
