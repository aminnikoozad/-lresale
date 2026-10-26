import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { issueOnlyReturns, withinReturnReportingPeriod } from '../lib/return-policy.ts';

const migration = readFileSync(new URL('../supabase/migrations/20261026172119_confirmed_issue_returns.sql', import.meta.url), 'utf8');
const buyer = '00000000-0000-4000-8000-000000000001';
const stranger = '00000000-0000-4000-8000-000000000002';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('reporting window has an inclusive seven-day boundary and preserves historical policy selection', () => {
  const received = '2026-10-01T12:00:00Z';
  assert(withinReturnReportingPeriod(received, Date.parse('2026-10-08T12:00:00Z')));
  assert(!withinReturnReportingPeriod(received, Date.parse('2026-10-08T12:00:00.001Z')));
  assert(!withinReturnReportingPeriod(null));
  assert(!withinReturnReportingPeriod('invalid'));
  assert(!withinReturnReportingPeriod('2099-01-01'));
  assert(!issueOnlyReturns('2026-10-18'));
  assert(!issueOnlyReturns(null));
  assert(issueOnlyReturns('2026-10-26'));
});

test('database rejects new preference returns and late ordinary claims, preserves legal claims and ownership', async () => {
  // SQL identity fixture only, not a genuine Auth/browser integration.
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table private.checkout_policy_versions(singleton boolean, return_policy_version text, updated_at timestamptz);
      insert into private.checkout_policy_versions values(true,'2026-10-18',now());
      create table public.orders(id uuid primary key,buyer_id uuid,status text,payment_status text,return_policy_version text,delivered_at timestamptz);
      create table public.order_items(id uuid primary key,order_id uuid);
      create table public.return_requests(id uuid default gen_random_uuid(),buyer_id uuid,order_id uuid,order_item_id uuid,reason text,details text,status text default 'submitted');
      alter table public.return_requests enable row level security;
      grant select on public.orders,public.order_items to authenticated;
      grant insert on public.return_requests to authenticated;
    `);
    await db.exec(migration);
    const versions = ['2026-10-26','2026-10-26','2026-10-18','2026-10-26','2026-10-26'];
    for (let n=1;n<=5;n++) {
      await db.query(`insert into public.orders values($1,$2,$3,$4,$5,now()-$6::interval)`,
        [id(n),n===4?stranger:buyer,'delivered',n===5?'pending':'paid',versions[n-1],n===2?'8 days':'1 day']);
      await db.query('insert into public.order_items values($1,$1)',[id(n)]);
    }
    await db.query(`select set_config('test.uid',$1,false)`,[buyer]);
    await db.exec('set role authenticated');
    const claim=(n:number,reason:string,details:string|null='Undisclosed hole',status='submitted',line=n)=>db.query(
      'insert into public.return_requests(buyer_id,order_id,order_item_id,reason,details,status) values($1,$2,$3,$4,$5,$6)',
      [buyer,id(n),id(line),reason,details,status]);
    for (const reason of ['wrong_item','damaged','not_as_described']) await claim(1,reason);
    await assert.rejects(claim(1,'fit_or_preference'),/row-level security/i);
    await assert.rejects(claim(1,'wrong_item','  '),/row-level security/i);
    await assert.rejects(claim(2,'wrong_item'),/row-level security/i);
    await claim(2,'other','Legal claim about an undisclosed defect');
    await claim(3,'fit_or_preference',null);
    await assert.rejects(claim(4,'wrong_item'),/row-level security/i);
    await assert.rejects(claim(5,'wrong_item'),/row-level security/i);
    await assert.rejects(claim(1,'wrong_item','Issue','approved'),/row-level security/i);
    await assert.rejects(claim(1,'wrong_item','Issue','submitted',3),/row-level security/i);
    await db.exec('reset role');
    const result=await db.query<{return_policy_version:string}>('select return_policy_version from private.checkout_policy_versions');
    assert.equal(result.rows[0].return_policy_version,'2026-10-26');
    const historical=await db.query<{return_policy_version:string}>('select return_policy_version from public.orders where id=$1',[id(3)]);
    assert.equal(historical.rows[0].return_policy_version,'2026-10-18');
  } finally { await db.close(); }
});
