import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync(new URL('../supabase/migrations/20261001030000_order_operations_without_gateway.sql',import.meta.url),'utf8');
const admin='00000000-0000-4000-8000-000000000001';
const buyer='00000000-0000-4000-8000-000000000002';
const oid='00000000-0000-4000-8000-000000000003';
const claim='00000000-0000-4000-8000-000000000004';

test('staff fulfilment requires verified payment and MFA; return review never refunds',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on all functions in schema auth to authenticated,anon;
      create table auth.users(id uuid primary key,email text);
      insert into auth.users values('${buyer}','buyer@example.test');
      create table public.admin_roles(user_id uuid,role text);
      insert into public.admin_roles values('${admin}','owner');
      create function private.assert_admin_permission(permission_name text) returns void language plpgsql security definer as $$begin
        if not exists(select 1 from public.admin_roles where user_id=auth.uid()) then raise exception 'admin permission denied'; end if;
      end$$;
      create table public.orders(id uuid primary key,buyer_id uuid,status text,payment_status text,
        subtotal_cents integer,shipping_cents integer,tax_cents integer,total_cents integer,
        recipient_name text,address_line1 text,address_line2 text,city text,province text,postal_code text,
        tracking_number text,reservation_expires_at timestamptz,created_at timestamptz default now(),paid_at timestamptz,updated_at timestamptz);
      insert into public.orders(id,buyer_id,status,payment_status,subtotal_cents,recipient_name,address_line1,city,province,postal_code)
      values('${oid}','${buyer}','awaiting_payment','not_configured',800,'Buyer','123 Main Street','Montreal','QC','H1A 1A1');
      create table public.order_items(id uuid,order_id uuid,item_name text,unit_price_cents integer);
      create table public.return_requests(id uuid primary key,order_id uuid,order_item_id uuid,reason text,status text,updated_at timestamptz);
      insert into public.return_requests values('${claim}','${oid}','${oid}','damaged','submitted',now());
      create table public.audit_logs(admin_user_id uuid,action text,entity_type text,entity_id text,previous_value jsonb,new_value jsonb,reason text);
    `);
    await db.exec(migration);
    await db.exec(`select set_config('test.uid','${buyer}',false);select set_config('test.aal','aal2',false);set role authenticated;`);
    await assert.rejects(db.query(`select public.admin_order_queue(50)`));
    await db.exec(`select set_config('test.uid','${admin}',false);select set_config('test.aal','aal1',false);`);
    await assert.rejects(db.query(`select public.admin_order_queue(50)`),/MFA required/);
    await db.exec(`select set_config('test.aal','aal2',false);`);
    const queue=(await db.query<{admin_order_queue:Array<{buyer_email:string}>}>(`select public.admin_order_queue(50)`)).rows[0].admin_order_queue;
    assert.equal(queue[0].buyer_email,'buyer@example.test');
    await assert.rejects(db.query(`select public.admin_progress_order('${oid}','processing',null)`),/Verified payment required/);
    await db.exec(`reset role;update public.orders set payment_status='paid',paid_at=now(),status='paid' where id='${oid}';set role authenticated;`);
    await db.query(`select public.admin_progress_order('${oid}','processing',null)`);
    await assert.rejects(db.query(`select public.admin_progress_order('${oid}','shipped',null)`),/tracking/);
    await db.query(`select public.admin_progress_order('${oid}','shipped','TRACK12345')`);
    await db.query(`select public.admin_progress_order('${oid}','delivered',null)`);
    await assert.rejects(db.query(`select public.admin_progress_order('${oid}','processing',null)`),/Invalid fulfilment transition/);
    await db.query(`select public.admin_review_return('${claim}','reviewing')`);
    await db.query(`select public.admin_review_return('${claim}','approved')`);
    await db.exec('reset role');
    const order=(await db.query<{status:string;payment_status:string}>(`select status,payment_status from public.orders where id='${oid}'`)).rows[0];
    assert.deepEqual(order,{status:'delivered',payment_status:'paid'});
  }finally{await db.close();}
});
