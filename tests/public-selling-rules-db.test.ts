import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {DEFAULT_SELLING_RULES} from '../lib/business-rules.ts';
const baselineSource=readFileSync(new URL('../supabase/migrations/20260905030000_selling_rules_bundles_admin.sql',import.meta.url),'utf8');
const baselineStart=baselineSource.indexOf('create or replace function public.get_selling_rules()');
const baselineEnd=baselineSource.indexOf('create or replace function public.can_manage_selling_rules()',baselineStart);
const baseline=baselineSource.slice(baselineStart,baselineEnd);
const migration=readFileSync(new URL('../supabase/migrations/20261017140000_public_selling_rules_projection.sql',import.meta.url),'utf8');

test('anonymous public policy projection strips unknown and mistyped fields at every level',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role; grant usage on schema public to anon, authenticated, service_role;
    create table public.business_setting_versions(value jsonb not null, setting_key text default 'selling_rules', effective_at timestamptz default now(), version integer default 1);`);
  await db.exec(baseline);
  await db.exec('grant execute on function public.get_selling_rules() to service_role');
  const fixture={...DEFAULT_SELLING_RULES,internal_notes:'PRIVATE_SENTINEL',pickupRules:{...DEFAULT_SELLING_RULES.pickupRules,internal_margin:'PRIVATE_SENTINEL'},commissionTiers:DEFAULT_SELLING_RULES.commissionTiers.map(t=>({...t,internal_cost:'PRIVATE_SENTINEL'})),discountSchedule:[{startDay:30,discountBps:1000,private_reason:'PRIVATE_SENTINEL'}]};
  await db.query('insert into public.business_setting_versions(value) values ($1::jsonb)',[JSON.stringify(fixture)]);
  await db.exec('set role anon');
  const legacy=await db.query<{v:unknown}>('select public.get_selling_rules() v');
  assert.ok(JSON.stringify(legacy.rows).includes('PRIVATE_SENTINEL'), 'actual repository baseline exposes full JSON');
  await db.exec('reset role');
  await db.exec(migration);
  assert.deepEqual((await db.query<{a:boolean;s:boolean}>("select has_function_privilege('authenticated','public.get_selling_rules()','execute') a, has_function_privilege('service_role','public.get_selling_rules()','execute') s")).rows,[{a:true,s:true}]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.get_selling_rules()'));
  await assert.rejects(db.query('select * from public.business_setting_versions'));
  const result=await db.query<{v:unknown}>('select public.get_public_selling_rules() v');
  assert.deepEqual(result.rows[0].v,{...DEFAULT_SELLING_RULES,discountSchedule:[{startDay:30,discountBps:1000}]});
  assert.ok(!JSON.stringify(result.rows).includes('PRIVATE_SENTINEL'));
  await db.exec('reset role');
  await db.query(`update public.business_setting_versions set value=jsonb_set(value,'{minimumPickupEstimatedValueCents}',$1::jsonb)`,[JSON.stringify({private:'PRIVATE_SENTINEL'})]);
  await db.exec('set role anon');
  const malformed=await db.query<{v:{minimumPickupEstimatedValueCents:unknown}}>('select public.get_public_selling_rules() v');
  assert.equal(malformed.rows[0].v.minimumPickupEstimatedValueCents,null);
  assert.ok(!JSON.stringify(malformed.rows).includes('PRIVATE_SENTINEL'));
  await db.exec('reset role; delete from public.business_setting_versions; set role anon');
  assert.equal((await db.query<{v:unknown}>('select public.get_public_selling_rules() v')).rows[0].v,null);
 } finally { await db.close(); }
});
