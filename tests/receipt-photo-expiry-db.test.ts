import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync(new URL('../supabase/migrations/20261013020000_receipt_photo_and_expiry_guards.sql',import.meta.url),'utf8');
// Local synthetic fixtures. No external database, Auth, storage or payment access.
async function fixture(){
  const db=new PGlite();
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create schema auth;create schema private;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role',current_setting('test.role',true))$$;
    create table public.collection_requests(id int primary key,status text);
    create table public.items(id int primary key,status text,photo_urls text[]);
    create table public.orders(id int primary key,status text,payment_status text,reservation_expires_at timestamptz,cancelled_at timestamptz,updated_at timestamptz);
    create table public.order_payment_attempts(order_id int,status text);
    create table public.inventory_reservations(id int primary key,order_id int,status text,updated_at timestamptz);
  `);
  await db.exec(migration);
  return db;
}

test('physical receipt is forward-only across all SQL writers, with same-state retries allowed',async()=>{
  const db=await fixture();
  try{
    await db.exec(`insert into collection_requests values(1,'collected'),(2,'inspection'),(3,'scheduled')`);
    for(const status of ['submitted','confirmed','scheduled','cancelled','missed']){
      for(const id of [1,2]) await assert.rejects(db.query('update collection_requests set status=$1 where id=$2',[status,id]),/Received pickup|under inspection/);
    }
    await assert.rejects(db.query("update collection_requests set status='collected' where id=2"),/under inspection/);
    await assert.rejects(db.query('update collection_requests set status=null where id=1'),/Received pickup/);
    await assert.rejects(db.query('update collection_requests set status=null where id=2'),/under inspection/);
    await db.exec(`update collection_requests set status=status; update collection_requests set status='inspection' where id=1; update collection_requests set status='completed' where id in (1,2); update collection_requests set status='cancelled' where id=3;`);
    assert.deepEqual((await db.query('select status from collection_requests order by id')).rows,[{status:'completed'},{status:'completed'},{status:'cancelled'}]);
  }finally{await db.close();}
});

test('photo references cannot be null, blank or multidimensional; publication cannot bypass the guard',async()=>{
  const db=await fixture();
  try{
    await db.exec(`insert into items values(1,'accepted','{}');`);
    for(const sql of ["array[null]::text[]","array['']","array['   ']","array[E'\\t\\n']","array['https://example.invalid/test.jpg',null]","array[['https://example.invalid/test.jpg']]"]){
      await assert.rejects(db.exec(`update items set photo_urls=${sql} where id=1`),/Photo references/);
      await assert.rejects(db.exec(`insert into items values(2,'listed',${sql})`),/Photo references/);
    }
    await assert.rejects(db.exec(`update items set status='listed' where id=1`),/At least one/);
    await assert.rejects(db.exec(`insert into items values(2,'relisted',null)`),/At least one/);
    // Existing app accepts HTTPS references; query strings and escaped characters are preserved.
    const url='https://example.invalid/storage/v1/object/sign/items/test%20photo.jpg?token=synthetic&width=800';
    await db.query("update items set photo_urls=array[$1],status='listed' where id=1",[url]);
    assert.equal((await db.query<{photo_urls:string[]}>('select photo_urls from items where id=1')).rows[0].photo_urls[0],url);
    await assert.rejects(db.exec(`update items set photo_urls='{}' where id=1`),/At least one/);
    await db.exec(`update items set status='accepted',photo_urls='{}' where id=1`);
  }finally{await db.close();}
});

test('expiry enforces bounded non-null batches and excludes live payment attempts',async()=>{
  const db=await fixture();
  try{
    await db.exec(`insert into orders(id,status,payment_status,reservation_expires_at) values(1,'awaiting_payment','not_configured',now()-interval '1 hour'),(2,'awaiting_payment','not_configured',now()-interval '1 hour'); insert into inventory_reservations(id,order_id,status) values(1,1,'active'),(2,2,'active');insert into order_payment_attempts values(2,'pending');select set_config('test.role','service_role',false);set role service_role;`);
    for(const limit of [null,0,-1,501])await assert.rejects(db.query('select public.expire_prepared_checkouts($1)',[limit]),/Invalid batch size/);
    assert.equal((await db.query<{n:number}>('select public.expire_prepared_checkouts(1) as n')).rows[0].n,1);
    assert.equal((await db.query<{n:number}>('select public.expire_prepared_checkouts(500) as n')).rows[0].n,0);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select status from inventory_reservations order by id')).rows,[{status:'expired'},{status:'active'}]);
    await db.exec("set role authenticated");await assert.rejects(db.query('select public.expire_prepared_checkouts(1)'),/permission denied/);
    await db.exec("reset role;select set_config('test.role','authenticated',false);set role service_role");await assert.rejects(db.query('select public.expire_prepared_checkouts(1)'),/Service role required/);
  }finally{await db.close();}
});
