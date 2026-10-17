import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Isolated SQL regression tests with an explicit auth.uid fixture stub.
// These are NOT evidence of genuine Auth, MFA or HTTP integration. The separate
// native operations matrix uses actual Supabase-issued tokens for that evidence.
const migration = readFileSync(new URL('../supabase/migrations/20261017140611_workflow_security_reconciliation.sql', import.meta.url), 'utf8').split('-- SECTION: 20261013180645_guard_return_submission_and_required_selling_rules.sql\n')[1].split('-- END SECTION')[0];
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const owner = id(1), buyer = id(2), other = id(3);
const rules = {
  minimumIndividualItemValueCents: 800,
  minimumPickupEstimatedValueCents: 6000,
  minimumSellingPriceCents: 800,
  commissionTiers: [
    { minCents: 800, maxCents: 9999, sellerBps: 4500, platformBps: 5500 },
    { minCents: 10000, maxCents: null, sellerBps: 5000, platformBps: 5000 },
  ],
};

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('fixture.user_id', true), '')::uuid
    $$;
    grant usage on schema auth, public to authenticated;
    grant execute on function auth.uid() to authenticated;
    create function public.can_manage_selling_rules() returns boolean language sql stable as $$
      select auth.uid() = '${owner}'::uuid
    $$;
    create table public.orders(id uuid primary key, buyer_id uuid not null, status text not null, payment_status text not null);
    create table public.order_items(id uuid primary key, order_id uuid not null references public.orders(id), unique(id,order_id));
    create table public.return_requests(
      id uuid primary key default gen_random_uuid(), buyer_id uuid not null,
      order_id uuid not null references public.orders(id), order_item_id uuid not null,
      reason text not null default 'damaged',
      status text not null default 'submitted' check(status in ('submitted','reviewing','approved','denied','refunded','closed')),
      unique(order_item_id), foreign key(order_item_id,order_id) references public.order_items(id,order_id)
    );
    alter table public.return_requests enable row level security;
    grant select, insert on public.return_requests to authenticated;
    grant select on public.orders, public.order_items to authenticated;
    create policy return_requests_select_own on public.return_requests
      for select to authenticated using(auth.uid()=buyer_id);
    create table public.business_setting_versions(
      id uuid primary key default gen_random_uuid(), setting_key text not null, version integer not null,
      value jsonb not null, effective_at timestamptz not null, created_by uuid, reason text,
      unique(setting_key,version)
    );
    create table public.audit_logs(
      admin_user_id uuid,action text,entity_type text,entity_id text,previous_value jsonb,new_value jsonb,reason text
    );
    create function public.get_selling_rules() returns jsonb language sql stable security definer set search_path='' as $$
      select value from public.business_setting_versions
      where setting_key='selling_rules' and effective_at<=now()
      order by effective_at desc,version desc limit 1
    $$;
    insert into public.orders values
      ('${id(10)}','${buyer}','delivered','paid'),
      ('${id(11)}','${buyer}','processing','paid'),
      ('${id(12)}','${buyer}','delivered','not_configured'),
      ('${id(13)}','${other}','delivered','paid'),
      ('${id(14)}','${buyer}','delivered','paid');
    insert into public.order_items values
      ('${id(20)}','${id(10)}'),('${id(21)}','${id(11)}'),('${id(22)}','${id(12)}'),
      ('${id(23)}','${id(13)}'),('${id(24)}','${id(14)}'),('${id(25)}','${id(10)}');
    insert into public.return_requests(id,buyer_id,order_id,order_item_id,status)
      values('${id(40)}','${other}','${id(13)}','${id(23)}','approved');
  `);
  await db.query(`insert into public.business_setting_versions(setting_key,version,value,effective_at,reason)
    values('selling_rules',1,$1::jsonb,now()-interval '1 day','original')`, [JSON.stringify(rules)]);
  await db.exec(migration);
  return db;
}

async function asUser(db: PGlite, uid: string) {
  await db.exec('reset role');
  await db.query(`select set_config('fixture.user_id',$1,false)`, [uid]);
  await db.exec('set role authenticated');
}

const claim = (db: PGlite, order = id(10), line = id(20), uid = buyer, status?: string | null) =>
  status === undefined
    ? db.query(`insert into public.return_requests(buyer_id,order_id,order_item_id) values($1,$2,$3) returning status`, [uid, order, line])
    : db.query(`insert into public.return_requests(buyer_id,order_id,order_item_id,status) values($1,$2,$3,$4) returning status`, [uid, order, line, status]);

test('return insertion accepts submitted only; cross-user, cross-order and direct update remain denied', async () => {
  const db = await fixture();
  try {
    await asUser(db, buyer);
    for (const status of ['reviewing', 'approved', 'denied', 'refunded', 'closed']) {
      await assert.rejects(claim(db, id(10), id(20), buyer, status), /row-level security/i, status);
    }
    await assert.rejects(claim(db, id(10), id(20), buyer, null), /null|row-level security/i);
    await assert.rejects(claim(db, id(10), id(20), other, 'submitted'), /row-level security/i);
    await assert.rejects(claim(db, id(13), id(23), buyer, 'submitted'), /row-level security/i);
    await assert.rejects(claim(db, id(10), id(24), buyer, 'submitted'), /row-level security|foreign key/i);
    await assert.rejects(claim(db, id(11), id(21)), /row-level security/i);
    await assert.rejects(claim(db, id(12), id(22)), /row-level security/i);
    const defaulted = await claim(db);
    assert.equal(defaulted.rows[0].status, 'submitted');
    const explicit = await claim(db, id(14), id(24), buyer, 'submitted');
    assert.equal(explicit.rows[0].status, 'submitted');
    await assert.rejects(claim(db), /duplicate key|unique constraint/i);
    await assert.rejects(db.query(`update public.return_requests set status='approved' where order_item_id=$1`, [id(20)]), /permission denied/i);
    await assert.rejects(db.query(`update public.return_requests set buyer_id=$1 where order_item_id=$2`, [other, id(20)]), /permission denied/i);
    await assert.rejects(db.query(`update public.return_requests set status='denied' where id=$1`, [id(40)]), /permission denied/i);
    const visible = await db.query<{ buyer_id: string; status: string }>('select buyer_id,status from public.return_requests');
    assert.equal(visible.rows.length, 2);
    assert(visible.rows.every(r => r.buyer_id === buyer && r.status === 'submitted'));
    await db.exec('reset role');
    const prior = await db.query<{ status: string }>(`select status from public.return_requests where id=$1`, [id(40)]);
    assert.equal(prior.rows[0].status, 'approved', 'Migration must not rewrite prior administrative decisions');
  } finally { await db.close(); }
});

const updateRules = (db: PGlite, value: unknown, effective = '2099-01-01T00:00:00Z', reason = 'Synthetic regression') =>
  db.query<{ update_selling_rules: number }>('select public.update_selling_rules($1::jsonb,$2,$3::timestamptz)', [JSON.stringify(value), reason, effective]);

test('selling-rule missing/null/type-invalid required fields cannot create any version or audit row', async () => {
  const db = await fixture();
  try {
    await asUser(db, owner);
    const invalid: Array<[string, unknown]> = [['null rules', null], ['array rules', []]];
    for (const key of ['minimumIndividualItemValueCents', 'minimumPickupEstimatedValueCents', 'commissionTiers'] as const) {
      const missing: Record<string, unknown> = structuredClone(rules); delete missing[key];
      invalid.push([`missing ${key}`, missing], [`null ${key}`, { ...rules, [key]: null }]);
    }
    for (const key of ['minCents', 'sellerBps', 'platformBps'] as const) {
      const missing: { commissionTiers: Array<Record<string, unknown>> } = structuredClone(rules);
      delete missing.commissionTiers[0][key]; invalid.push([`missing tier ${key}`, missing]);
      const nil = structuredClone(rules) as unknown as { commissionTiers: Array<Record<string, unknown>> };
      nil.commissionTiers[0][key] = null; invalid.push([`null tier ${key}`, nil]);
    }
    invalid.push(['string minimum', { ...rules, minimumPickupEstimatedValueCents: '6000' }]);
    const stringTier = structuredClone(rules) as unknown as { commissionTiers: Array<Record<string, unknown>> };
    stringTier.commissionTiers[0].sellerBps = '4500'; invalid.push(['string percentage', stringTier]);
    invalid.push(['fractional minimum', { ...rules, minimumPickupEstimatedValueCents: 6000.5 }]);
    invalid.push(['negative minimum', { ...rules, minimumPickupEstimatedValueCents: -1 }]);
    invalid.push(['zero minimum', { ...rules, minimumIndividualItemValueCents: 0 }]);
    for (const [label, value] of invalid) {
      await assert.rejects(updateRules(db, value), undefined, label);
      await assert.rejects(updateRules(db, value, '2000-01-01T00:00:00Z'), undefined, `${label}: current/past effective`);
    }
    await db.exec('reset role');
    assert.equal((await db.query<{ count: number }>('select count(*)::integer count from public.business_setting_versions')).rows[0].count, 1);
    assert.equal((await db.query<{ count: number }>('select count(*)::integer count from public.audit_logs')).rows[0].count, 0);
    const row = (await db.query<{ value: unknown }>('select value from public.business_setting_versions')).rows[0];
    assert.deepEqual(row.value, rules);
  } finally { await db.close(); }
});

test('valid future/current rule versions preserve old snapshots and normal tier validation', async () => {
  const db = await fixture();
  try {
    await asUser(db, buyer);
    await assert.rejects(updateRules(db, rules), /permission required/i);
    await asUser(db, owner);
    const future = { ...rules, minimumPickupEstimatedValueCents: 7000 };
    assert.equal((await updateRules(db, future)).rows[0].update_selling_rules, 2);
    assert.deepEqual((await db.query<{ get_selling_rules: unknown }>('select public.get_selling_rules()')).rows[0].get_selling_rules, rules);
    const current = { ...rules, minimumPickupEstimatedValueCents: 6500 };
    assert.equal((await updateRules(db, current, new Date(Date.now() - 1000).toISOString())).rows[0].update_selling_rules, 3);
    assert.deepEqual((await db.query<{ get_selling_rules: unknown }>('select public.get_selling_rules()')).rows[0].get_selling_rules, current);
    for (const kind of ['gap', 'overlap', 'negative', 'bad-sum', 'bounded-final', 'reversed']) {
      const invalid = structuredClone(rules);
      if (kind === 'gap') invalid.commissionTiers[1].minCents += 1;
      if (kind === 'overlap') invalid.commissionTiers[1].minCents -= 1;
      if (kind === 'negative') { invalid.commissionTiers[0].sellerBps = -1; invalid.commissionTiers[0].platformBps = 10001; }
      if (kind === 'bad-sum') invalid.commissionTiers[0].sellerBps += 1;
      if (kind === 'bounded-final') invalid.commissionTiers[1].maxCents = 1000000;
      if (kind === 'reversed') invalid.commissionTiers[0].maxCents = 799;
      await assert.rejects(updateRules(db, invalid), undefined, kind);
    }
    await assert.rejects(updateRules(db, rules, '2099-01-01T00:00:00Z', 'x'), /reason/i);
    await assert.rejects(db.query('select public.update_selling_rules($1::jsonb,$2,null)', [JSON.stringify(rules), 'Synthetic regression']), /Effective time/i);
    await db.exec('reset role');
    const versions = await db.query<{ version: number; value: unknown }>('select version,value from public.business_setting_versions order by version');
    assert.deepEqual(versions.rows, [{ version: 1, value: rules }, { version: 2, value: future }, { version: 3, value: current }]);
    assert.equal((await db.query<{ count: number }>('select count(*)::integer count from public.audit_logs')).rows[0].count, 2);
  } finally { await db.close(); }
});

