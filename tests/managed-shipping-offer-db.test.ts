import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/migrations/20261026205635_managed_shipping_offer.sql',import.meta.url),'utf8');
test('managed shipping threshold, discount re-evaluation, seller isolation and immutable paid orders',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema private;
 create table public.items(id integer primary key,sale_mode text,physical_custody text,shipping_responsibility text);
 create table public.orders(id integer primary key,status text default 'awaiting_payment',payment_status text default 'not_configured',subtotal_cents integer,discount_cents integer default 0,shipping_cents integer,total_cents integer);
 create table public.order_items(order_id integer,item_id integer);
 create table public.order_payment_attempts(order_id integer,status text);
 create table public.postal_quotes(id integer primary key,order_id integer,rates jsonb);
 insert into public.items values(1,'managed_consignment','team','team'),(2,'peer_to_peer','seller','seller');`);
 await db.exec(sql);
 async function order(n:number,subtotal:number,mode='managed',shipping=1200,status='awaiting_payment'){
 await db.query('insert into public.orders(id,subtotal_cents,shipping_cents,status) values($1,$2,$3,$4)',[n,subtotal,shipping,status]);
 await db.query('insert into public.order_items values($1,$2)',[n,mode==='personal'?2:1]);
 if(mode==='mixed')await db.query('insert into public.order_items values($1,2)',[n]);
 await db.query(`insert into public.postal_quotes values($1,null,'[{"serviceCode":"DOM.RP","totalCents":1200},{"serviceCode":"DOM.XP","totalCents":2000}]')`,[n]);
 await db.query('update public.postal_quotes set order_id=$1 where id=$1',[n]);
 return (await db.query<{shipping_cents:number}>('select shipping_cents from public.orders where id=$1',[n])).rows[0].shipping_cents;
 }
 assert.equal(await order(1,10000),0);
 assert.equal(await order(2,9999),1200);
 assert.equal(await order(3,12000,'personal'),1200);
 assert.equal(await order(4,12000,'mixed'),1200);
 assert.equal(await order(5,12000,'managed',2000),2000);
 assert.equal(await order(6,12000,'managed',1200,'paid'),1200);
 await db.query("insert into public.order_payment_attempts values(7,'pending')");
 assert.equal(await order(7,12000),1200);
 assert.equal(await order(8,12000),0);
 await db.query('update public.orders set discount_cents=2500 where id=8');
 assert.equal((await db.query<{shipping_cents:number}>('select shipping_cents from public.orders where id=8')).rows[0].shipping_cents,1200);
 await db.query('update public.orders set discount_cents=2000 where id=8');
 assert.equal((await db.query<{shipping_cents:number}>('select shipping_cents from public.orders where id=8')).rows[0].shipping_cents,0);
 await db.exec("update public.orders set status='paid',payment_status='paid' where id=8; update public.orders set discount_cents=5000 where id=8;");
 assert.equal((await db.query<{shipping_cents:number}>('select shipping_cents from public.orders where id=8')).rows[0].shipping_cents,0);
 }finally{await db.close();}
});
