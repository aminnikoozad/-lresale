import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './fixtures/marketplace-db.ts';
import {identity,seller,buyer,other,staff} from './fixtures/buyer-sales-db.ts';
const migration=readFileSync(new URL('../supabase/migrations/20261021114432_marketplace_community_trading.sql',import.meta.url),'utf8');
async function setup(){const db=await marketplaceFixture();// PGlite's fixed database is postgres; only the database-name fixture constant differs.
 await db.exec(migration.replace("current_database()='shikimomo_staging'","current_database()='postgres'"));await identity(db,seller);
 await db.query("select public.save_marketplace_seller('Real seller','Montréal','Clothing in my closet','individual',false,0)");
 const items:string[]=[];for(let n=0;n<2;n++)items.push((await db.query<{v:{id:string}}>('select public.save_marketplace_draft(null,0,$1) v',[{name:`QA shirt ${n}`,category:'women',brand_kind:'unknown',price_cents:4000}])).rows[0].v.id);
 await db.exec('reset role');for(const i of items)await db.query('insert into private.marketplace_rehearsal_access values($1,$2)',[i,buyer]);await identity(db,buyer);
 const thread=(await db.query<{v:string}>('select public.marketplace_start_thread($1) v',[items[0]])).rows[0].v;return {db,items,thread};}
test('private messages are owner scoped, idempotent, read tracked, rate limited, and cannot forge system events',async()=>{const {db,thread}=await setup();try{
 const r=randomUUID();const send=(body='Hello about this shirt')=>db.query<{v:string}>('select public.marketplace_send_message($1,$2,$3) v',[thread,body,r]);const m=(await send()).rows[0].v;assert.equal((await send()).rows[0].v,m);await assert.rejects(send('changed'),/Request already used/);
 await assert.rejects(db.query("insert into private.marketplace_messages(thread_id,kind,body,request_id) values($1,'offer_accepted','paid',$2)",[thread,randomUUID()]),/permission denied/);
 await identity(db,other);await assert.rejects(db.query('select public.marketplace_workspace($1)',[thread]),/unavailable/);await assert.rejects(db.query('select public.marketplace_send_message($1,$2,$3)',[thread,'intrusion',randomUUID()]),/unavailable/);
 await identity(db,seller);let w=(await db.query<{v:{messages:unknown[];threads:Array<{unread:number}>}}>('select public.marketplace_workspace($1) v',[thread])).rows[0].v;assert.equal(w.messages.length,1);assert.equal(w.threads[0].unread,1);
 await db.query('select public.marketplace_read_thread($1)',[thread]);w=(await db.query<{v:typeof w}>('select public.marketplace_workspace($1) v',[thread])).rows[0].v as typeof w;assert.equal(w.threads[0].unread,0);
 await db.query('select public.marketplace_block($1,true)',[thread]);await identity(db,buyer);await assert.rejects(db.query('select public.marketplace_send_message($1,$2,$3)',[thread,'Blocked',randomUUID()]),/unavailable/);
 await identity(db,seller);await db.query('select public.marketplace_block($1,false)',[thread]);await identity(db,buyer);
 for(let n=0;n<9;n++)await db.query('select public.marketplace_send_message($1,$2,$3)',[thread,`msg ${n}`,randomUUID()]);await assert.rejects(db.query('select public.marketplace_send_message($1,$2,$3)',[thread,'one too many',randomUUID()]),/rate limit/);
 }finally{await db.close();}});
test('same seller Bundle offers and counteroffers preserve versions, expire, and never charge or reserve inventory',async()=>{const {db,items,thread}=await setup();try{
 const request=randomUUID();const offer=(parent:string|null=null,amount=6500,req=randomUUID())=>db.query<{v:string}>('select public.marketplace_make_offer($1,$2,$3,$4,$5) v',[thread,items,amount,parent,req]);
 const first=(await offer(null,6500,request)).rows[0].v;assert.equal((await offer(null,6500,request)).rows[0].v,first);await assert.rejects(offer(null,6400,request),/already used/);
 await assert.rejects(db.query('select public.marketplace_respond_offer($1,true)',[first]),/unavailable/);
 await identity(db,seller);const counter=(await offer(first,7000)).rows[0].v;
 await identity(db,buyer);assert.equal((await db.query<{v:string}>('select public.marketplace_respond_offer($1,true) v',[counter])).rows[0].v,'accepted');assert.equal((await db.query<{v:string}>('select public.marketplace_respond_offer($1,true) v',[counter])).rows[0].v,'accepted');
 await db.exec('reset role');await db.query("insert into public.business_setting_versions(setting_key,version,value,reason) values('marketplace_policy',2,'{\"offerHours\":48,\"commercialApproved\":false}','Synthetic policy change')");await identity(db,buyer);const expiry=(await offer()).rows[0].v;await db.exec('reset role');const policies=(await db.query<{policy_version:number;hours:string}>("select policy_version,policy_snapshot->>'offerHours' as hours from private.marketplace_offers where id in($1,$2) order by policy_version",[first,expiry])).rows;assert.deepEqual(policies,[{policy_version:1,hours:'24'},{policy_version:2,hours:'48'}]);await db.query("update private.marketplace_offers set expires_at=now()-interval '1 second' where id=$1",[expiry]);await identity(db,seller);assert.equal((await db.query<{v:string}>('select public.marketplace_respond_offer($1,true) v',[expiry])).rows[0].v,'expired');
 const snap=(await db.query<{v:{offers:Array<{lines:Array<{id:string;version:number}>}>}}>('select public.marketplace_workspace($1) v',[thread])).rows[0].v;assert.equal(snap.offers[0].lines.length,2);
 await db.exec('reset role');for(const table of ['orders','inventory_reservations','wallet_transactions'])assert.equal((await db.query(`select * from public.${table}`)).rows.length,0);
 }finally{await db.close();}});
test('offer acceptance rejects changed listings, mixed sellers, vacations and duplicate inventory',async()=>{const {db,items,thread}=await setup();try{
 const make=()=>db.query<{v:string}>('select public.marketplace_make_offer($1,$2,6500,null,$3) v',[thread,items,randomUUID()]);const o=(await make()).rows[0].v;
 await assert.rejects(db.query('select public.marketplace_make_offer($1,$2,6500,null,$3)',[thread,[items[0],items[0]],randomUUID()]),/Invalid offer/);
 await identity(db,seller);const current=(await db.query<{v:Array<{id:string;listing_version:number}>}>('select public.my_marketplace_drafts() v')).rows[0].v.find(x=>x.id===items[1])!;await db.query('select public.save_marketplace_draft($1,$2,$3)',[items[1],current.listing_version,{name:'Changed shirt',category:'women',brand_kind:'unknown',price_cents:4100}]);assert.equal((await db.query<{v:string}>('select public.marketplace_respond_offer($1,true) v',[o])).rows[0].v,'invalidated');
 await db.query("select public.save_marketplace_seller('Real seller','Montréal','','individual',true,1)");await identity(db,buyer);await assert.rejects(make(),/vacation/);
 await db.exec('reset role');await db.query('update private.marketplace_sellers set vacation=false');await identity(db,seller);const current2=(await db.query<{v:Array<{id:string;listing_version:number}>}>('select public.my_marketplace_drafts() v')).rows[0].v.find(x=>x.id===items[1])!;await db.query('select public.save_marketplace_draft($1,$2,$3)',[items[1],current2.listing_version,{name:'Unpriced shirt',category:'women',brand_kind:'unknown',price_cents:null}]);await identity(db,buyer);await assert.rejects(make(),/Bundle changed/);await db.exec('reset role');await db.query('update private.marketplace_threads set seller_id=$1 where id=$2',[other,thread]);await identity(db,buyer);await assert.rejects(make(),/Bundle changed/);
 }finally{await db.close();}});
test('public seller projection hides owner and drafts, follows are real, reports and moderation require capability and MFA',async()=>{const {db,items}=await setup();try{
 await identity(db,seller);const w=(await db.query<{v:{profile:{id:string}}}>('select public.marketplace_workspace() v')).rows[0].v;const sid=w.profile.id;
 await identity(db,buyer);await db.query('select public.marketplace_follow($1,true)',[sid]);const req=randomUUID();const report=(await db.query<{v:string}>('select public.marketplace_report($1,null,$2,$3) v',[items[0],'Photo issue needing review',req])).rows[0].v;
 assert.equal((await db.query<{v:string}>('select public.marketplace_report($1,null,$2,$3) v',[items[0],'Photo issue needing review',req])).rows[0].v,report);await assert.rejects(db.query('select public.admin_marketplace_queue()'),/MFA/);
 await identity(db,staff,'authenticated','aal1');await assert.rejects(db.query('select public.admin_marketplace_queue()'),/MFA/);await identity(db,staff);assert.equal((await db.query<{v:{reports:unknown[]}}>('select public.admin_marketplace_queue() v')).rows[0].v.reports.length,1);
 await db.query('select public.admin_marketplace_moderate($1,$2,null,true,$3)',['report',report,'Reviewed synthetic fixture report']);
 await identity(db,'','anon');const s=(await db.query<{v:Record<string,unknown>}>('select public.marketplace_store($1,1) v',[sid])).rows[0].v;assert.equal('user_id' in s,false);assert.deepEqual(s.items,[]);await assert.rejects(db.query('select public.marketplace_workspace()'),/permission denied/);await assert.rejects(db.query('select * from private.marketplace_threads'),/permission denied/);
 await identity(db,other);await assert.rejects(db.query('select public.marketplace_report(null,$1,$2,$3)',[randomUUID(),'Cannot report unknown message',randomUUID()]),/unavailable/);await assert.rejects(db.query('select public.marketplace_request_review($1,1)',[items[0]]),/changed/);
 }finally{await db.close();}});

test('content review requires current seller photos and MFA; approval never publishes or records inspection',async()=>{const {db,items}=await setup();try{
 await identity(db,seller);const d=(await db.query<{v:Array<{id:string;listing_version:number}>}>('select public.my_marketplace_drafts() v')).rows[0].v.find(i=>i.id===items[0])!;
 const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft($1,$2,$3) v',[items[0],d.listing_version,{name:'Documented QA shirt',category:'women',brand_kind:'unknown',price_cents:4000,item_condition:'Good',description:'Synthetic item with complete photo disclosure for testing.'}])).rows[0].v;
 await assert.rejects(db.query('select public.marketplace_request_review($1,$2)',[saved.id,saved.version]),/Complete profile/);
 let n=0;for(const role of ['front','back','left','right']){n++;const asset=randomUUID();await db.exec('reset role');const result=await db.query<{v:{version:number}}>('select public.register_marketplace_photo($1,$2,$3,$4,$5,null,$6,$7,$8,400,400,900) v',[saved.id,seller,saved.version,asset,role,'neon_staging',`${seller}/${saved.id}/${asset}.webp`,String(n).padStart(64,'0')]);saved.version=result.rows[0].v.version;await identity(db,seller);}
 await db.query("select public.submit_marketplace_evidence($1,$2,'no_known_flaws',true,true)",[saved.id,saved.version]);await db.query('select public.marketplace_request_review($1,$2)',[saved.id,saved.version]);
 await identity(db,staff);await db.query('select public.admin_marketplace_moderate($1,$2,$3,true,$4)',['listing',saved.id,saved.version,'Synthetic content checked; no physical inspection']);
 await identity(db,seller);const row=(await db.query<{v:{reviews:Array<{status:string}>}}>('select public.marketplace_workspace() v')).rows[0].v;assert.equal(row.reviews[0].status,'approved');
 await db.exec('reset role');const item=(await db.query<{status:string;inspected_at:null;published_at:null}>('select status,inspected_at,published_at from public.items where id=$1',[saved.id])).rows[0];assert.equal(item.status,'listing_preparation');assert.equal(item.inspected_at,null);assert.equal(item.published_at,null);
 }finally{await db.close();}});

test('current main admin pricing trigger remains enforced for managed items while direct seller pricing stays editable',async()=>{const db=await marketplaceFixture();try{
 const source=readFileSync(new URL('../supabase/migrations/20261020182321_ai_pricing_foundation.sql',import.meta.url),'utf8');const start=source.indexOf('create function private.guard_pricing_approval()');const finish=source.indexOf('create function public.admin_approve_item_price',start);
 await db.exec(`alter table public.items add column pricing_approval_id uuid;create table private.pricing_approvals(id uuid,item_id uuid,price_cents integer,item_fingerprint text,approved_by uuid,previous_approval_id uuid);create function private.pricing_staff() returns boolean language sql as $$select false$$;create function private.pricing_admin() returns boolean language sql as $$select false$$;create function private.pricing_fingerprint(public.items) returns text language sql as $$select 'fixture'::text$$;`);await db.exec(source.slice(start,finish));await db.exec(migration);
 await identity(db,seller);const saved=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[{name:'Direct price authority',category:'women',brand_kind:'unknown',price_cents:4000}])).rows[0].v;
 await db.query('select public.save_marketplace_draft($1,$2,$3)',[saved.id,saved.version,{name:'Direct price authority',category:'women',brand_kind:'unknown',price_cents:4200}]);
 await db.exec('reset role');await assert.rejects(db.query('update public.items set pricing_approval_id=$2 where id=$1',[saved.id,randomUUID()]),/Direct items/);await assert.rejects(db.query("update public.items set listed_price_cents=9999 where sale_mode='managed_consignment'"),/admin approval/);
 }finally{await db.close();}});
