import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const owner='00000000-0000-4000-8000-000000000001';
test('pilot gates are reversible, private, MFA protected and enforce no-show policy',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create table auth.users(id uuid primary key);insert into auth.users values('${owner}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
 grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
 create function public.can_manage_selling_rules() returns boolean language sql as $$select auth.uid()='${owner}'$$;
 create function public.get_selling_rules() returns jsonb language sql as $$select '{}'::jsonb$$;
 create table public.audit_logs(admin_user_id uuid,action text,entity_type text,entity_id text,previous_value jsonb,new_value jsonb,reason text);
 create table public.items(id uuid primary key default gen_random_uuid(),name text,brand text,category text,subcategory text,size text,item_condition text,color text,material text,pattern text,photo_urls text[],listed_price_cents integer,initial_approved_price_cents integer,published_at timestamptz,created_at timestamptz default now(),status text,condition_notes text,description text,inspected_at timestamptz);
 create table public.profiles(id uuid primary key,free_pickup_status text default 'active',missed_pickup_count integer default 0,outstanding_missed_pickup_fee_cents integer default 0);insert into public.profiles(id) values('${owner}');
 create table public.pickup_slots(id uuid primary key default gen_random_uuid(),window_start timestamptz);
 create table public.collection_requests(id uuid primary key default gen_random_uuid(),user_id uuid,category text,pickup_slot_id uuid,status text,confirmation_status text);
 create table public.wallet_transactions(transaction_type text);
 create table public.inventory_reservations(item_id uuid,status text,expires_at timestamptz);
 create table public.knowledge_base(status text,approved_answer text,updated_at timestamptz,title text,question_examples text[],category_code text,tags text[],source_kind text,source_ref text,approved_at timestamptz);
 create table public.business_setting_versions(setting_key text,version integer,value jsonb,effective_at timestamptz,reason text);
 `);
 await db.exec(readFileSync(new URL('../supabase/migrations/20260924041425_reversible_pilot.sql',import.meta.url),'utf8'));
 await db.exec('set role anon');assert.equal((await db.query('select * from public.pilot_settings')).rows.length,1);await assert.rejects(db.exec("update public.pilot_settings set enabled=false"));await assert.rejects(db.query('select * from public.product_questions'));await assert.rejects(db.query('select * from public.pilot_work_logs'));await assert.rejects(db.query('select public.get_selling_rules()'));
 await db.exec(`reset role;set test.uid='${owner}';set test.aal='aal1';set role authenticated`);await assert.rejects(db.exec("select public.admin_save_pilot(false,array['women'],30,array[6],8,null)"));
 await db.exec(`reset role;set test.aal='aal2';set role authenticated`);await db.exec("select public.admin_save_pilot(true,array['women'],1,array[6],8,null)");
 await db.exec('reset role');await assert.rejects(db.exec("insert into public.items(category,status) values('men','listed')"));
 const id=(await db.query<{id:string}>("insert into public.items(category,status,name,listed_price_cents) values('women','listed','Test',5000) returning id")).rows[0].id;
 await assert.rejects(db.exec("insert into public.items(category,status) values('women','received')"));
 await db.exec('set role anon');await db.query("select public.submit_product_question($1,'test@example.com','Does this item have pockets?')",[id]);await assert.rejects(db.query('select * from public.product_questions'));
 await db.exec(`reset role;set role authenticated`);assert.equal((await db.query('select * from public.product_questions')).rows.length,1);
 await db.exec("select public.admin_save_pilot(false,array['women'],1,array[6],8,null)");await db.exec('reset role');await db.exec("insert into public.items(category,status) values('men','received')");
 await db.exec("select public.admin_save_pilot(true,array['women','men'],30,array[6],8,null)");
 const slot=(await db.query<{id:string}>("insert into public.pickup_slots(window_start) values('2026-09-26T16:00:00Z') returning id")).rows[0].id;
 for(let n=0;n<2;n++){const q=(await db.query<{id:string}>("insert into public.collection_requests(user_id,category,pickup_slot_id,status,confirmation_status) values($1,'women',$2,'confirmed','confirmed') returning id",[owner,slot])).rows[0].id;await db.query("update public.collection_requests set status='missed' where id=$1",[q]);await db.query("update public.collection_requests set status='missed' where id=$1",[q]);}
 const profile=(await db.query<{missed_pickup_count:number,free_pickup_status:string}>('select * from public.profiles')).rows[0];assert.equal(profile.missed_pickup_count,2);assert.equal(profile.free_pickup_status,'suspended');
 await assert.rejects(db.query("insert into public.collection_requests(user_id,category,pickup_slot_id) values($1,'women',$2)",[owner,slot]));await assert.rejects(db.exec("insert into public.wallet_transactions values('missed_pickup_fee')"));
 await db.exec("select public.admin_save_pilot(true,array['women'],30,array[6],8,null)");assert.equal((await db.query("select * from public.catalog_items_v3()")).rows.length,1);
 }finally{await db.close();}
});
