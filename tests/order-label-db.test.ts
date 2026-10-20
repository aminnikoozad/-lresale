import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20261020031044_canada_post_order_labels.sql',import.meta.url),'utf8');
const order='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';
test('server-only ledger consumes one quote, requires paid order and unchanged address',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key);insert into auth.users values('${actor}');
 create table public.orders(id uuid primary key,status text,payment_status text,paid_at timestamptz,tracking_number text,recipient_name text,address_line1 text,address_line2 text,city text,province text,postal_code text);
 insert into public.orders values('${order}','paid','pending',null,null,'Buyer','123 Main St',null,'Ottawa','ON','K1A 0B1');
 create table public.admin_roles(user_id uuid,role text,can_manage_shipping boolean);insert into public.admin_roles values('${actor}','admin',true);
 create table public.audit_logs(admin_user_id uuid,action text,entity_type text,entity_id text,new_value jsonb,reason text);
 grant usage on schema public,auth to service_role,anon,authenticated;
 grant select,update on public.orders to service_role;grant select on public.admin_roles to service_role;grant insert on public.audit_logs to service_role;
 `);
 await db.exec(migration);
 const {rows:[label]}=await db.query<{id:string}>(`insert into public.order_shipping_labels(order_id,request,configuration_hash,estimate_cents,expires_at,created_by) values('${order}','{"requestId":"reference","destination":{"name":"Buyer","addressDetails":{"addressLine1":"123 Main St","city":"Ottawa","provState":"ON","postalZipCode":"K1A0B1"}}}','hash',1234,now()+interval '10 minutes','${actor}') returning id`);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from public.order_shipping_labels'),/permission denied/);
 await assert.rejects(db.query(`select public.begin_order_label_purchase('${label.id}','${actor}','reference','hash')`),/permission denied/);
 await db.exec('reset role');
 await assert.rejects(db.query(`select public.begin_order_label_purchase('${label.id}','${actor}','reference','hash')`),/Paid unshipped/);
 await db.exec(`update public.orders set payment_status='paid',paid_at=now(),address_line1='Changed'`);
 await assert.rejects(db.query(`select public.begin_order_label_purchase('${label.id}','${actor}','reference','hash')`),/Address changed/);
 await db.exec(`update public.orders set address_line1='123 Main St';update public.order_shipping_labels set expires_at=now()-interval '1 second'`);
 await assert.rejects(db.query(`select public.begin_order_label_purchase('${label.id}','${actor}','reference','hash')`),/Quote unavailable/);
 await db.exec(`update public.order_shipping_labels set expires_at=now()+interval '10 minutes'`);
 await assert.rejects(db.query(`select public.begin_order_label_purchase('${label.id}','${actor}','old-tab','hash')`),/Quote unavailable/);
 await db.exec('set role service_role');
 await db.query(`select public.begin_order_label_purchase('${label.id}','${actor}','reference','hash')`);
 await db.exec('reset role');
 assert.equal((await db.query<{status:string}>('select status from public.order_shipping_labels')).rows[0].status,'submitting');
 await assert.rejects(db.query(`select public.begin_order_label_purchase('${label.id}','${actor}','reference','hash')`),/Quote unavailable/);
 await assert.rejects(db.query(`insert into public.order_shipping_labels(order_id,request,configuration_hash,estimate_cents,expires_at,created_by) values('${order}','{}','hash',1234,now(),'${actor}')`),/duplicate key/);
 } finally {await db.close();}
});
