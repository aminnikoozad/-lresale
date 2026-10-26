import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {sellerBalances} from '../lib/seller-ledger.ts';
import {marketplaceCommission} from '../lib/marketplace.ts';
import {marketplaceFixture} from './fixtures/marketplace-db.ts';
import {applySellerPolicy} from './fixtures/marketplace-policy-db.ts';
import {identity,seller,other,staff,ids} from './fixtures/buyer-sales-db.ts';
const migration=readFileSync(new URL('../supabase/migrations/20261026051515_separate_seller_ledgers_and_direct_publication.sql',import.meta.url),'utf8');
const sql=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
async function setup(){const db=await marketplaceFixture();await db.exec(sql('20261021114432_marketplace_community_trading'));await applySellerPolicy(db);await db.exec('create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');await db.exec(sql('20261022115748_direct_submission_rollout'));await db.exec('create function private.pilot_category_active(text) returns boolean language sql as $$select true$$');await db.exec(migration);return db;}
test('approved personal fee is 15% with a single CAD 1.50 floor, without changing managed rules or opening payments',async()=>{
 const db=await setup();try{
  const before=(await db.query('select public.get_selling_rules() v')).rows[0];
  await db.exec('begin;'+sql('20261026053214_approve_personal_selling_fees')+'commit;');
  await identity(db,'','anon');
  const fee=(await db.query<{v:{version:number;commissionBps:number;minimumCommissionCents:number;scope:string}}>('select public.personal_selling_fee_policy() v')).rows[0].v;
  assert.equal(fee.commissionBps,1500);assert.equal(fee.minimumCommissionCents,150);assert.equal(fee.scope,'seller_suborder');
  assert.equal(marketplaceCommission(800,fee).commissionCents,150);
  assert.equal(marketplaceCommission(2000,fee).commissionCents,300);
  assert.equal(marketplaceCommission(1600,fee).commissionCents,240);
  await db.exec('reset role');assert.deepEqual((await db.query('select public.get_selling_rules() v')).rows[0],before);
  const policy=(await db.query<{value:{feesApproved:boolean;newPurchasesEnabled:boolean;commercialApproved:boolean}}>("select value from public.business_setting_versions where setting_key='marketplace_policy' order by version desc limit 1")).rows[0].value;
  assert.equal(policy.feesApproved,true);assert.equal(policy.newPurchasesEnabled,false);assert.equal(policy.commercialApproved,false);
 }finally{await db.close();}
});
test('sale balances never blend sources, debit purchases or count reversed/pending money as confirmed',()=>{
 const rows=[
  {sale_mode:'managed_consignment',transaction_type:'sale_credit',status:'completed',amount_cents:6000},
  {sale_mode:'managed_consignment',transaction_type:'adjustment',status:'completed',amount_cents:-6000},
  {sale_mode:'peer_to_peer',transaction_type:'sale_credit',status:'completed',amount_cents:8500},
  {sale_mode:'peer_to_peer',transaction_type:'sale_credit',status:'pending',amount_cents:1200},
  {sale_mode:'peer_to_peer',transaction_type:'sale_credit',status:'reversed',amount_cents:5000},
  {sale_mode:'peer_to_peer',transaction_type:'purchase_debit',status:'completed',amount_cents:-4000},
  {sale_mode:null,transaction_type:'adjustment',status:'completed',amount_cents:9999},
 ] as Parameters<typeof sellerBalances>[0];
 assert.deepEqual(sellerBalances(rows),{managed_consignment:{pending:0,confirmed:0},peer_to_peer:{pending:1200,confirmed:8500},unallocated:1});
});
test('wallet mode is derived and immutable; wrong-source fees and unconnected payouts are rejected',async()=>{
 const db=await setup();try{
 await db.exec('reset role');
 const w=(await db.query<{id:string; sale_mode:string;commission_snapshot:{sellerBps:number}}>("insert into public.wallet_transactions(user_id,item_id,amount_cents,transaction_type,status,description) values($1,$2,600,'sale_credit','pending','Synthetic managed credit') returning *",[seller,ids[0]])).rows[0];
 assert.equal(w.sale_mode,'managed_consignment');assert.equal(w.commission_snapshot.sellerBps,6000);
 await assert.rejects(db.query("update public.wallet_transactions set sale_mode='peer_to_peer' where id=$1",[w.id]),/immutable/);
 await assert.rejects(db.query("insert into public.wallet_transactions(user_id,item_id,sale_mode,amount_cents,transaction_type,status,description) values($1,$2,'peer_to_peer',600,'sale_credit','pending','Wrong source')",[seller,ids[0]]),/mismatch/);
 await assert.rejects(db.query("insert into public.wallet_transactions(user_id,sale_mode,amount_cents,transaction_type,status,description) values($1,'peer_to_peer',-150,'missed_pickup_fee','completed','Wrong pickup')",[seller]),/managed selling only/);
 await assert.rejects(db.query("insert into public.wallet_transactions(user_id,sale_mode,amount_cents,transaction_type,status,description) values($1,'peer_to_peer',-150,'payout_debit','completed','No provider')",[seller]),/verified payout provider/);
 }finally{await db.close();}
});
test('personal listings require owner consent and current review; only approved public photos are readable, edits revoke visibility',async()=>{
 const db=await setup();try{
 await identity(db,seller);await db.query("select public.save_marketplace_seller('Synthetic shop','Montréal','','individual',false,0)");
 const draft=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[{name:'Synthetic shirt',category:'women',brand_kind:'unknown',price_cents:4000,item_condition:'Good',description:'Synthetic item description for test only.'}])).rows[0].v;
 const asset=randomUUID();await db.exec('reset role');draft.version=(await db.query<{v:{version:number}}>('select public.register_marketplace_photo($1,$2,$3,$4,$5,null,$6,$7,$8,400,400,900) v',[draft.id,seller,draft.version,asset,'front','supabase',`${seller}/${draft.id}/${asset}.webp`,'9'.repeat(64)])).rows[0].v.version;
 await identity(db,seller);await db.query("select public.submit_marketplace_evidence($1,$2,'no_known_flaws',true,true)",[draft.id,draft.version]);await db.query("select public.marketplace_submit_listing($1,$2,2,'en-CA',true)",[draft.id,draft.version]);
 await assert.rejects(db.query('select public.set_direct_listing_publication($1,$2,true,true)',[draft.id,draft.version]),/approval/);
 await identity(db,staff);await db.query("select public.admin_marketplace_moderate('listing',$1,$2,true,'Synthetic content reviewed')",[draft.id,draft.version]);
 await identity(db,other);await assert.rejects(db.query('select public.set_direct_listing_publication($1,$2,true,true)',[draft.id,draft.version]),/changed/);
 await identity(db,seller);await assert.rejects(db.query('select public.set_direct_listing_publication($1,$2,true,false)',[draft.id,draft.version]),/Confirm public/);
 await db.query('select public.set_direct_listing_publication($1,$2,true,true)',[draft.id,draft.version]);
 await identity(db,'','anon');const catalog=(await db.query<{v:Array<{item_id:string;checkout_enabled:boolean;photo_urls:string[]}>}>('select public.direct_catalog() v')).rows[0].v;
 assert.equal(catalog.length,1);assert.equal(catalog[0].item_id,draft.id);assert.equal(catalog[0].checkout_enabled,false);assert.equal(catalog[0].photo_urls[0],`/api/marketplace/public-photos/${asset}`);
 await assert.rejects(db.query('select public.direct_public_photo($1)',[asset]),/permission denied/);
 await db.exec('reset role');assert.ok((await db.query<{v:unknown}>('select public.direct_public_photo($1) v',[asset])).rows[0].v);
 const before=(await db.query('select * from public.wallet_transactions')).rows.length;
 await assert.rejects(db.query("insert into public.wallet_transactions(user_id,item_id,amount_cents,transaction_type,status,description) values($1,$2,3400,'sale_credit','completed','No real direct payment')",[seller,draft.id]),/own verified payment pipeline/);
 await identity(db,seller);await db.query('select public.set_direct_listing_publication($1,$2,false,false)',[draft.id,draft.version]);await identity(db,'','anon');assert.deepEqual((await db.query<{v:unknown}>('select public.direct_catalog() v')).rows[0].v,[]);
 await identity(db,seller);await db.query('select public.set_direct_listing_publication($1,$2,true,true)',[draft.id,draft.version]);await db.query('select public.save_marketplace_draft($1,$2,$3)',[draft.id,draft.version,{name:'Changed synthetic shirt',category:'women',brand_kind:'unknown',price_cents:4100}]);
 await identity(db,'','anon');assert.deepEqual((await db.query<{v:unknown}>('select public.direct_catalog() v')).rows[0].v,[]);await db.exec('reset role');assert.equal((await db.query<{v:unknown}>('select public.direct_public_photo($1) v',[asset])).rows[0].v,null);assert.equal((await db.query('select * from public.wallet_transactions')).rows.length,before);
 }finally{await db.close();}
});
