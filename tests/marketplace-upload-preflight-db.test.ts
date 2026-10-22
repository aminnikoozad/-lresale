import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './fixtures/marketplace-db.ts';
import {applySellerPolicy} from './fixtures/marketplace-policy-db.ts';
import {identity,seller,other} from './fixtures/buyer-sales-db.ts';
async function setup(){const db=await marketplaceFixture();await db.exec(readFileSync(new URL('../supabase/migrations/20261021114432_marketplace_community_trading.sql',import.meta.url),'utf8'));await applySellerPolicy(db);await db.exec(readFileSync(new URL('../supabase/migrations/20261022131358_marketplace_upload_preflight.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/migrations/20261022132717_marketplace_ten_photo_limit.sql',import.meta.url),'utf8'));await identity(db,seller);const d=(await db.query<{v:{id:string;version:number}}>('select public.save_marketplace_draft(null,0,$1) v',[{name:'Upload security fixture',category:'women',brand_kind:'unknown',price_cents:4000}])).rows[0].v;return{db,d};}
test('upload preflight rejects wrong owner, stale versions and anonymous callers before any provider work',async()=>{const {db,d}=await setup();try{
 await identity(db,other);await assert.rejects(db.query('select public.marketplace_begin_photo_upload($1,$2,$3)',[d.id,d.version,randomUUID()]),/Draft changed/);
 await identity(db,seller);await assert.rejects(db.query('select public.marketplace_begin_photo_upload($1,$2,$3)',[d.id,d.version-1,randomUUID()]),/Draft changed/);
 await identity(db,'','anon');await assert.rejects(db.query('select public.marketplace_begin_photo_upload($1,$2,$3)',[d.id,d.version,randomUUID()]),/permission denied/);
 }finally{await db.close();}});
test('every upload retry consumes the owner budget, and the 81st attempt is rejected without creating assets or financial rows',async()=>{const {db,d}=await setup();try{
 const asset=randomUUID();for(let n=0;n<80;n++)await db.query('select public.marketplace_begin_photo_upload($1,$2,$3)',[d.id,d.version,asset]);await assert.rejects(db.query('select public.marketplace_begin_photo_upload($1,$2,$3)',[d.id,d.version,asset]),/Photo upload rate limit/);
 await db.exec('reset role');assert.equal((await db.query("select * from public.audit_logs where action='marketplace.photo_upload_attempt'")).rows.length,80);for(const table of ['private.marketplace_photo_assets','public.orders','public.wallet_transactions'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
 await db.exec("update public.audit_logs set created_at=now()-interval '2 hours' where action='marketplace.photo_upload_attempt'");await identity(db,seller);await db.query('select public.marketplace_begin_photo_upload($1,$2,$3)',[d.id,d.version,asset]);
 }finally{await db.close();}});
test('a full photo gallery blocks new storage attempts but allows bounded retries of an existing asset',async()=>{const {db,d}=await setup();try{
 const first=randomUUID();for(let n=0;n<10;n++){const asset=n===0?first:randomUUID();await db.exec('reset role');d.version=(await db.query<{v:{version:number}}>('select public.register_marketplace_photo($1,$2,$3,$4,$5,null,$6,$7,$8,400,400,900) v',[d.id,seller,d.version,asset,'front','supabase',`${seller}/${d.id}/${asset}.webp`,String(n+1).padStart(64,'0')])).rows[0].v.version;}
 await identity(db,seller);await assert.rejects(db.query('select public.marketplace_begin_photo_upload($1,$2,$3)',[d.id,d.version,randomUUID()]),/Maximum 10/);await db.query('select public.marketplace_begin_photo_upload($1,$2,$3)',[d.id,d.version,first]);
 await db.exec('reset role');const extra=randomUUID();await assert.rejects(db.query('select public.register_marketplace_photo($1,$2,$3,$4,$5,null,$6,$7,$8,400,400,900)',[d.id,seller,d.version,extra,'front','supabase',`${seller}/${d.id}/${extra}.webp`,'f'.repeat(64)]),/Maximum 10/);assert.equal((await db.query('select * from private.marketplace_photo_assets')).rows.length,10);assert.equal((await db.query("select * from public.audit_logs where action='marketplace.photo_upload_attempt'")).rows.length,1);
 }finally{await db.close();}});
