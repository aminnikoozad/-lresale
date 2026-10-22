import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './fixtures/marketplace-db.ts';
import {applySellerPolicy} from './fixtures/marketplace-policy-db.ts';
import {identity,seller,other,staff} from './fixtures/buyer-sales-db.ts';
async function setup(){const db=await marketplaceFixture();await db.exec(readFileSync(new URL('../supabase/migrations/20261021114432_marketplace_community_trading.sql',import.meta.url),'utf8'));await applySellerPolicy(db);await identity(db,seller);return db;}
const fields={name:'Final submission synthetic shirt',category:'women',brand_kind:'unknown',price_cents:4000,item_condition:'Good',description:'Synthetic shirt for testing; label absent.'};
test('composer save retries are idempotent, owner scoped, and reject reuse with changed fields',async()=>{const db=await setup();try{
 const request=randomUUID();const save=()=>db.query<{v:{id:string;listing_version:number}}>('select public.marketplace_save_editor($1,null,0,$2) v',[request,fields]);const first=(await save()).rows[0].v;assert.deepEqual((await save()).rows[0].v,first);
 await assert.rejects(db.query('select public.marketplace_save_editor($1,null,0,$2)',[request,{...fields,name:'Different payload'}]),/Request already used/);
 await identity(db,other);await assert.rejects(db.query('select public.marketplace_save_editor($1,$2,$3,$4)',[randomUUID(),first.id,first.listing_version,fields]),/Draft unavailable/);
 await db.exec('reset role');assert.equal((await db.query('select * from public.items where sale_mode=\'peer_to_peer\'')).rows.length,1);
 }finally{await db.close();}});
test('final acceptance and review are atomic, versioned, private, immutable, and require explicit consent every time',async()=>{const db=await setup();try{
 await db.query("select public.save_marketplace_seller('Synthetic shop','Montréal','','individual',false,0)");
 const item=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[fields])).rows[0].v;
 const submit=(accept:boolean,version=item.version,policy=1)=>db.query<{v:{submitted:boolean;public:boolean}}>("select public.marketplace_submit_listing($1,$2,$3,'fr-CA',$4) v",[item.id,version,policy,accept]);
 await assert.rejects(submit(false),/Read and accept/);await assert.rejects(submit(true),/Complete profile/);
 await db.exec('reset role');assert.equal((await db.query('select * from private.marketplace_terms_acceptances')).rows.length,0);assert.equal((await db.query('select * from private.marketplace_listing_reviews')).rows.length,0);
 const asset=randomUUID();item.version=(await db.query<{v:{version:number}}>('select public.register_marketplace_photo($1,$2,$3,$4,$5,null,$6,$7,$8,400,400,900) v',[item.id,seller,item.version,asset,'front','neon_staging',`${seller}/${item.id}/${asset}.webp`,'7'.repeat(64)])).rows[0].v.version;
 await identity(db,seller);await db.query("select public.submit_marketplace_evidence($1,$2,'no_known_flaws',true,true)",[item.id,item.version]);
 await assert.rejects(submit(true,item.version-1),/Draft changed/);await assert.rejects(submit(true,item.version,0),/Read and accept/);
 await identity(db,other);await assert.rejects(submit(true),/Draft changed/);await identity(db,seller);
 assert.deepEqual((await submit(true)).rows[0].v,{submitted:true,public:false,version:item.version});
 await assert.rejects(submit(false),/Read and accept/);await assert.rejects(db.query('select public.marketplace_request_review($1,$2)',[item.id,item.version]),/explicit policy acceptance/);
 await submit(true);await assert.rejects(db.query('select private.marketplace_request_review_core($1,$2)',[item.id,item.version]),/permission denied/);
 const projection=(await db.query<{v:Array<{id:string;review_status:string}>}>('select public.my_marketplace_drafts() v')).rows[0].v;assert.equal(projection.find(x=>x.id===item.id)?.review_status,'pending');
 await assert.rejects(db.query('select * from private.marketplace_listing_submissions'),/permission denied/);
 await identity(db,staff,'authenticated','aal1');await assert.rejects(db.query('select public.admin_marketplace_moderate($1,$2,$3,true,$4)',['listing',item.id,item.version,'Test approval without MFA']),/MFA|permission|Required|Staff|staff/i);
 await identity(db,staff);await db.query('select public.admin_marketplace_moderate($1,$2,$3,true,$4)',['listing',item.id,item.version,'Synthetic content review only']);
 await db.exec('reset role');assert.equal((await db.query('select * from private.marketplace_listing_submissions')).rows.length,1);await assert.rejects(db.query("update private.marketplace_listing_submissions set locale='en-CA'"),/immutable/);
 const state=(await db.query<{status:string;inspected_at:null;published_at:null}>('select status,inspected_at,published_at from public.items where id=$1',[item.id])).rows[0];assert.deepEqual(state,{status:'listing_preparation',inspected_at:null,published_at:null});
 for(const table of ['orders','wallet_transactions'])assert.equal((await db.query(`select * from public.${table}`)).rows.length,0);
 }finally{await db.close();}});
