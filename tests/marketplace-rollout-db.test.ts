import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './fixtures/marketplace-db.ts';
import {applySellerPolicy} from './fixtures/marketplace-policy-db.ts';
import {identity,seller,other,staff} from './fixtures/buyer-sales-db.ts';
async function setup(){const db=await marketplaceFixture();await db.exec(readFileSync(new URL('../supabase/migrations/20261021114432_marketplace_community_trading.sql',import.meta.url),'utf8'));await applySellerPolicy(db);await db.exec('create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');await db.exec(readFileSync(new URL('../supabase/migrations/20261022115748_direct_submission_rollout.sql',import.meta.url),'utf8'));return db;}
test('production listing-only policy works without synthetic marker and never approves commercial terms',async()=>{const db=await setup();try{
 await db.exec('drop function public.assert_synthetic_staging()');await identity(db,seller);
 await assert.rejects(db.query("select public.marketplace_accept_seller_terms(2,'en-CA',false)"),/Read and accept/);await assert.rejects(db.query("select public.marketplace_accept_seller_terms(1,'en-CA',true)"),/Read and accept/);
 assert.equal((await db.query<{v:{commercialEnabled:boolean}}>("select public.marketplace_accept_seller_terms(2,'fr-CA',true) v")).rows[0].v.commercialEnabled,false);
 const doc=(await db.query<{v:{value:{submissionOnly:boolean;commercialApproved:boolean}}}>('select public.marketplace_policy_document() v')).rows[0].v;assert.equal(doc.value.submissionOnly,true);assert.equal(doc.value.commercialApproved,false);
 await db.exec('reset role');const bucket=(await db.query<{public:boolean;allowed_mime_types:string[]}>('select * from storage.buckets')).rows[0];assert.equal(bucket.public,false);assert.deepEqual(bucket.allowed_mime_types,['image/webp']);
 for(const table of ['orders','wallet_transactions'])assert.equal((await db.query(`select * from public.${table}`)).rows.length,0);
 }finally{await db.close();}});
test('admin moderation can inspect submitted photos only with capability and MFA; other sellers cannot read them',async()=>{const db=await setup();try{
 await identity(db,seller);await db.query("select public.save_marketplace_seller('Review shop','Montréal','','individual',false,0)");
 const draft=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[{name:'Synthetic shirt',category:'women',brand_kind:'unknown',price_cents:4000,item_condition:'Good',description:'Synthetic item description for tests only.'}])).rows[0].v;
 const asset=randomUUID();await db.exec('reset role');draft.version=(await db.query<{v:{version:number}}>('select public.register_marketplace_photo($1,$2,$3,$4,$5,null,$6,$7,$8,400,400,900) v',[draft.id,seller,draft.version,asset,'front','supabase',`${seller}/${draft.id}/${asset}.webp`,'9'.repeat(64)])).rows[0].v.version;
 await identity(db,seller);await db.query("select public.submit_marketplace_evidence($1,$2,'no_known_flaws',true,true)",[draft.id,draft.version]);await db.query("select public.marketplace_submit_listing($1,$2,2,'en-CA',true)",[draft.id,draft.version]);
 await identity(db,other);assert.equal((await db.query<{v:unknown}>('select public.my_marketplace_photo($1) v',[asset])).rows[0].v,null);
 await identity(db,staff,'authenticated','aal1');assert.equal((await db.query<{v:unknown}>('select public.my_marketplace_photo($1) v',[asset])).rows[0].v,null);await assert.rejects(db.query('select public.admin_marketplace_queue()'),/MFA/);
 await identity(db,staff);assert.ok((await db.query<{v:unknown}>('select public.my_marketplace_photo($1) v',[asset])).rows[0].v);
 const q=(await db.query<{v:{reviews:Array<{photos:Array<{id:string}>;acceptance:{policyVersion:number}}>} }>('select public.admin_marketplace_queue() v')).rows[0].v;assert.equal(q.reviews[0].photos[0].id,asset);assert.equal(q.reviews[0].acceptance.policyVersion,2);
 // Material edits invalidate both the queue and staff asset access until resubmitted.
 await identity(db,seller);await db.query('select public.save_marketplace_draft($1,$2,$3)',[draft.id,draft.version,{name:'Changed synthetic shirt',category:'women',brand_kind:'unknown',price_cents:4100}]);await identity(db,staff);assert.equal((await db.query<{v:{reviews:unknown[]}}>('select public.admin_marketplace_queue() v')).rows[0].v.reviews.length,0);assert.equal((await db.query<{v:unknown}>('select public.my_marketplace_photo($1) v',[asset])).rows[0].v,null);
 }finally{await db.close();}});
