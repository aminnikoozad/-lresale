import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync(new URL('../supabase/migrations/20261001023500_pre_payment_order_lifecycle.sql',import.meta.url),'utf8');
const buyer='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const item='00000000-0000-4000-8000-000000000003';

test('checkout preparation is atomic, private and cancellable without payment',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role',current_setting('test.role',true))$$;
      grant usage on schema auth,public to authenticated,service_role;
      grant execute on all functions in schema auth to authenticated,service_role;
      create table public.orders(id uuid primary key default gen_random_uuid(),buyer_id uuid,status text,payment_status text,
        reservation_expires_at timestamptz,buyer_terms_version text,return_policy_version text,privacy_notice_version text,
        buyer_terms_accepted_at timestamptz,cancelled_at timestamptz,updated_at timestamptz default now());
      create table public.inventory_reservations(id uuid primary key default gen_random_uuid(),order_id uuid,item_id uuid,status text,updated_at timestamptz default now());
      create table public.order_payment_attempts(order_id uuid,status text);
      alter table public.orders enable row level security;
      alter table public.inventory_reservations enable row level security;
      grant select on public.orders,public.inventory_reservations to authenticated;
      create policy buyer_orders on public.orders for select to authenticated using(buyer_id=auth.uid());
      create policy buyer_reservations on public.inventory_reservations for select to authenticated
        using(exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()));
      create function public.create_checkout_order(item_ids uuid[],recipient_name text,address_line1 text,address_line2 text,city text,province text,postal_code text)
      returns uuid language plpgsql security definer as $$declare oid uuid;begin
        insert into public.orders(buyer_id,status,payment_status,reservation_expires_at)
        values(auth.uid(),'awaiting_payment','not_configured',now()+interval '10 minutes') returning id into oid;
        insert into public.inventory_reservations(order_id,item_id,status) values(oid,item_ids[1],'active');
        return oid;
      end$$;
      create function public.create_postal_checkout(p_quote uuid,p_service text,recipient_name text,address_line1 text,address_line2 text,city text,province text,postal_code text)
      returns uuid language sql security definer as $$select public.create_checkout_order(array['${item}'::uuid],recipient_name,address_line1,address_line2,city,province,postal_code)$$;
    `);
    await db.exec(migration);
    await db.exec(`select set_config('test.uid','${buyer}',false);set role authenticated;`);
    const args=`array['${item}'::uuid],null,null,'Buyer','123 Main Street',null,'Montreal','QC','H1A 1A1'`;
    await assert.rejects(db.query(`select public.prepare_checkout_with_terms(${args},'wrong','2026-09-25','2026-09-25')`),/policy versions changed/i);
    assert.equal(Number((await db.query<{count:number}>(`select count(*) from public.orders`)).rows[0].count),0);
    const {rows}=await db.query<{id:string}>(`select public.prepare_checkout_with_terms(${args},'2026-09-25','2026-09-25','2026-09-25') as id`);
    const oid=rows[0].id;
    const prepared=await db.query<{buyer_terms_version:string;buyer_terms_accepted_at:string}>(`select buyer_terms_version,buyer_terms_accepted_at from public.orders where id='${oid}'`);
    assert.equal(prepared.rows[0].buyer_terms_version,'2026-09-25');
    assert.ok(prepared.rows[0].buyer_terms_accepted_at);
    await db.exec(`select set_config('test.uid','${other}',false)`);
    await assert.rejects(db.query(`select public.cancel_prepared_checkout('${oid}')`),/Order unavailable/);
    await db.exec(`select set_config('test.uid','${buyer}',false)`);
    assert.equal((await db.query<{cancel_prepared_checkout:boolean}>(`select public.cancel_prepared_checkout('${oid}')`)).rows[0].cancel_prepared_checkout,true);
    assert.equal((await db.query<{cancel_prepared_checkout:boolean}>(`select public.cancel_prepared_checkout('${oid}')`)).rows[0].cancel_prepared_checkout,false);
    assert.equal((await db.query<{status:string}>(`select status from public.inventory_reservations where order_id='${oid}'`)).rows[0].status,'released');
    await assert.rejects(db.query(`select public.expire_prepared_checkouts(200)`));

    const next=(await db.query<{id:string}>(`select public.prepare_checkout_with_terms(${args},'2026-09-25','2026-09-25','2026-09-25') as id`)).rows[0].id;
    await db.exec(`reset role;update public.orders set reservation_expires_at=now()-interval '1 hour' where id='${next}';
      select set_config('test.role','service_role',false);set role service_role;`);
    assert.equal((await db.query<{expire_prepared_checkouts:number}>(`select public.expire_prepared_checkouts(200)`)).rows[0].expire_prepared_checkouts,1);
    assert.equal((await db.query<{expire_prepared_checkouts:number}>(`select public.expire_prepared_checkouts(200)`)).rows[0].expire_prepared_checkouts,0);
    await db.exec('reset role');
    assert.equal((await db.query<{status:string}>(`select status from public.inventory_reservations where order_id='${next}'`)).rows[0].status,'expired');
  } finally { await db.close(); }
});
