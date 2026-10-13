// Optional isolated full-schema regression. Inputs stay local and are never uploaded.
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{plan:{type:'string'},'publication-guard':{type:'string'}}});
if(!values.plan || !values['publication-guard'])throw new Error('Provide --plan and --publication-guard paths to reviewed local-only artifacts');
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
const db=new PGlite({extensions:{pg_trgm}});
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls; create role supabase_admin;
create schema auth; create schema storage; create schema extensions;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb,email_confirmed_at timestamptz,created_at timestamptz,updated_at timestamptz,phone text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create publication supabase_realtime;
`);
const plan=JSON.parse(readFileSync(values.plan,'utf8'));
for(const row of plan.statements)await db.exec(row.sql);
await db.exec(readFileSync(values['publication-guard'],'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261013020000_receipt_photo_and_expiry_guards.sql',import.meta.url),'utf8'));
import assert from 'node:assert/strict';
const staff='11111111-1111-4111-8111-111111111111',seller='22222222-2222-4222-8222-222222222222',buyer='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',area='55555555-5555-4555-8555-555555555555',slot='66666666-6666-4666-8666-666666666666';
const checks={clean:true,intact:true,suitable_for_resale:true,no_significant_damage:true,wearable_without_stains_tears_holes:true};
let passed=0;
const ok=(name)=>{passed++;console.log('PASS',passed,name)};
async function identity(id,aal='aal2',role='authenticated'){await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,[id||'',JSON.stringify({sub:id,aal,role,is_anonymous:false})]);await db.exec(`set role ${role}`)}
async function denies(name,sql,args=[],pattern){await assert.rejects(db.query(sql,args),pattern);ok(name)}
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function bag(uid=seller,value=6000){return scalar(`insert into public.collection_requests(user_id,request_type,category,address,estimated_resale_value_cents,item_count,condition_confirmed,policy_accepted,pickup_policy_accepted,service_area_id,pickup_slot_id) values($1,'bag','women','123 Synthetic Test Street',$2,8,true,true,true,$3,$4) returning id`,[uid,value,area,slot]);}
try{
await db.exec(`grant usage on schema auth to anon,authenticated,service_role; grant execute on all functions in schema auth to anon,authenticated,service_role;`);
await db.exec(`insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at,created_at,updated_at) values ${[staff,seller,buyer,other].map((x,i)=>`('${x}','synthetic-${i}@example.invalid','{}','{}',now(),now(),now())`).join(',')};insert into public.admin_roles(user_id,role,require_mfa,can_manage_pickups,can_manage_shipping) values('${staff}','owner',true,true,true);`);

await db.exec(`insert into public.service_areas(id,city,province,pickup_mode,active,within_local_radius,distance_from_montreal_km) values('${area}','Synthetic City','QC','review',true,true,1);insert into public.pickup_slots(id,service_area_id,window_start,window_end,capacity) values('${slot}','${area}',date_trunc('week',now())+interval '12 days 18 hours',date_trunc('week',now())+interval '12 days 20 hours',10);`);
await identity(seller);
await denies('bag under CAD60 rejected',`insert into public.collection_requests(user_id,request_type,category,address,estimated_resale_value_cents,item_count,condition_confirmed,policy_accepted,pickup_policy_accepted,service_area_id,pickup_slot_id) values($1,'bag','women','123 Synthetic Test Street',5999,8,true,true,true,$2,$3)`,[seller,area,slot],/minimum|at least/i);
const bagId=await bag();ok('seller creates bag via RLS and all production triggers');
await denies('cross-user bag insert rejected',`insert into public.collection_requests(user_id,request_type,category,address,estimated_resale_value_cents,item_count,condition_confirmed,policy_accepted,pickup_policy_accepted,service_area_id,pickup_slot_id) values($1,'bag','women','123 Synthetic Test Street',6000,8,true,true,true,$2,$3)`,[other,area,slot],/row-level security/i);
await identity(other);assert.equal((await db.query('select * from public.collection_requests where id=$1',[bagId])).rows.length,0);ok('cross-user bag hidden by RLS');await denies('cross-user confirm rejected','select public.confirm_own_pickup($1)',[bagId],/no longer available/i);
await identity(staff,'aal1');await denies('AAL1 receipt rejected','select public.admin_update_collection_request_status($1,$2)',[bagId,'collected'],/mfa/i);
await identity(staff);await denies('unconfirmed receipt rejected','select public.admin_update_collection_request_status($1,$2)',[bagId,'collected'],/confirmation/i);
await identity(seller);await db.query('select public.confirm_own_pickup($1)',[bagId]);ok('seller confirms own pickup actual RPC');
await identity(staff);for(const status of ['scheduled','collected','inspection'])await db.query('select public.admin_update_collection_request_status($1,$2)',[bagId,status]);ok('staff receipt and inspection statuses actual RPC');
const item=await scalar(`select public.admin_create_item_v2($1,$2,'Synthetic jacket','Test','women','M','Good',800,'manual_review','Synthetic only')`,[seller,bagId]);ok('staff creates received item');
await db.query('select public.admin_attest_item_inspection($1,$2)',[item,checks]);await db.query(`select public.admin_review_item($1,800,'accept',null)`,[item]);ok('staff attestation and acceptance actual RPC');
await db.query(`select public.admin_set_item_photos($1,array['https://example.invalid/synthetic.jpg'])`,[item]);ok('staff synthetic photo reference stored');
await denies('publish before seller approval rejected','select public.admin_publish_item($1)',[item],/seller/i);
await identity(other);await denies('other seller approval rejected','select public.approve_item_pricing($1,800)',[item],/unavailable/i);
await identity(seller);await denies('stale seller approval rejected','select public.approve_item_pricing($1,801)',[item],/changed/i);await db.query('select public.approve_item_pricing($1,800)',[item]);ok('seller pricing approval actual RPC');
await denies('duplicate pricing approval rejected','select public.approve_item_pricing($1,800)',[item],/unavailable/i);
await identity(staff);await denies('underfloor publication rejected','select public.admin_publish_item($1,799)',[item],/minimum/i);await db.query('select public.admin_publish_item($1)',[item]);ok('admin publishes fully gated item');
await identity(null,'aal1','anon');assert.equal((await db.query('select * from public.catalog_items() where item_id=$1',[item])).rows.length,1);ok('published item visible in public catalog');
await identity(buyer);
const checkout=()=>scalar(`select public.prepare_checkout_with_terms(array[$1::uuid],null,null,'Synthetic Buyer','123 Test Street',null,'Montreal','QC','H1A 1A1','2026-09-25','2026-09-25','2026-09-25')`,[item]);
const order=await checkout();ok('different buyer prepares order using actual checkout reservation body');
await denies('double click rejected without extra order',`select public.prepare_checkout_with_terms(array[$1::uuid],null,null,'Synthetic Buyer','123 Test Street',null,'Montreal','QC','H1A 1A1','2026-09-25','2026-09-25','2026-09-25')`,[item],/reserved/i);
await identity(other);assert.equal((await db.query('select * from public.orders where id=$1',[order])).rows.length,0);assert.equal((await db.query('select * from public.order_items where order_id=$1',[order])).rows.length,0);assert.equal((await db.query('select * from public.inventory_reservations where order_id=$1',[order])).rows.length,0);ok('other buyer cannot see order lines or reservations through RLS');await denies('other buyer cancel rejected','select public.cancel_prepared_checkout($1)',[order],/unavailable/i);
await identity(buyer);assert.equal(await scalar('select public.cancel_prepared_checkout($1)',[order]),true);assert.equal(await scalar('select public.cancel_prepared_checkout($1)',[order]),false);ok('cancel idempotent and reservation released');
await identity(other);const second=await checkout();ok('restocked item reservable by another buyer');
await db.exec('reset role');await db.query(`update public.orders set reservation_expires_at=now()-interval '1 hour' where id=$1`,[second]);await db.query(`update public.inventory_reservations set expires_at=now()-interval '1 hour' where order_id=$1`,[second]);await identity(null,'aal2','service_role');assert.equal(await scalar('select public.expire_prepared_checkouts(200)'),1);assert.equal(await scalar('select public.expire_prepared_checkouts(200)'),0);ok('service expiry releases stock idempotently');
await identity(buyer);await checkout();ok('expired item reservable again');
await identity(staff);
await denies('null photo array rejected','select public.admin_set_item_photos($1,array[null]::text[])',[item],/Photo references/);
await denies('empty photo string rejected',"select public.admin_set_item_photos($1,array[''])",[item],/Photo references/);
await denies('whitespace photo string rejected',"select public.admin_set_item_photos($1,array['   '])",[item],/Photo references/);
await denies('inspection rollback rejected',"select public.admin_update_collection_request_status($1,'submitted')",[bagId],/under inspection/);
await denies('inspection cancellation rejected',"select public.admin_update_collection_request_status($1,'cancelled')",[bagId],/under inspection/);
await db.query("select public.admin_update_collection_request_status($1,'completed')",[bagId]);ok('received bag advances to completion');
await identity(null,'aal2','service_role');await denies('null expiry batch rejected','select public.expire_prepared_checkouts(null)',[],/Invalid batch size/);
console.log('SUCCESS',passed);
}catch(e){console.error('FAIL after',passed,e.message,e.code);process.exitCode=1;}finally{await db.close();}
