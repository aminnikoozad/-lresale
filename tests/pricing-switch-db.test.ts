import test from 'node:test';
import assert from 'node:assert/strict';
import { pricingFixture,newItem } from './fixtures/pricing-db.ts';
import { identity,staff,seller,other } from './fixtures/buyer-sales-db.ts';
import { analyzePricing,type PricingInput } from '../lib/pricing/engine.ts';
const item='30000000-0000-4000-8000-000000000001';

test('suggestions default off; manual approval and publication remain available',async()=>{
 const db=await pricingFixture(false);
 try{
  await newItem(db,item);await identity(db,staff);
  const control=(await db.query<{v:{enabled:boolean;version:number}}>('select public.admin_pricing_control() v')).rows[0].v;
  assert.deepEqual({enabled:control.enabled,version:control.version},{enabled:false,version:1});
  await assert.rejects(db.query('select public.admin_request_pricing_analysis($1)',[item]),/suggestions are off/);
  await identity(db,staff,'service_role');
  assert.deepEqual((await db.query<{v:unknown[]}>('select public.claim_pricing_jobs() v')).rows[0].v,[]);
  await identity(db,staff);
  const w=(await db.query<{v:{snapshot:string}}>('select public.admin_pricing_workspace($1) v',[item])).rows[0].v;
  await db.query('select public.admin_approve_item_price($1,$2,2000,$3)',[item,w.snapshot,'Manual review while suggestions are disabled']);
  await db.query('select public.admin_publish_item($1,2000)',[item]);
  await db.exec('reset role');
  assert.equal((await db.query<{status:string}>('select status from public.items where id=$1',[item])).rows[0].status,'listed');
 }finally{await db.close();}
});

test('only owner/admin with MFA can toggle; stale versions and direct access are denied',async()=>{
 const db=await pricingFixture(false);
 const toggle=()=>db.query("select public.admin_set_pricing_enabled(1,true,'Intentional pricing activation test')");
 try{
  for(const uid of [seller,other]){await identity(db,uid);await assert.rejects(toggle(),/MFA/);}
  await identity(db,staff,'authenticated','aal1');await assert.rejects(toggle(),/MFA/);
  await identity(db,staff,'service_role');await assert.rejects(toggle(),/permission/);
  await identity(db,staff);await assert.rejects(db.query('select private.pricing_ai_enabled()'));
  await toggle();
  await assert.rejects(db.query("select public.admin_set_pricing_enabled(1,false,'Outdated browser tab must not overwrite state')"),/changed/);
  await assert.rejects(db.query("select public.admin_set_pricing_enabled(2,false,'short')"),/reason/);
  await db.query("select public.admin_set_pricing_enabled(2,false,'Pause suggestions after verified toggle test')");
  const control=(await db.query<{v:{enabled:boolean;history:unknown[]}}>('select public.admin_pricing_control() v')).rows[0].v;
  assert.equal(control.enabled,false);assert.equal(control.history.length,3);
  await db.exec('reset role');
  assert.equal((await db.query<{n:number}>("select count(*)::integer n from public.audit_logs where action='pricing.feature_changed'")).rows[0].n,2);
 }finally{await db.close();}
});

test('off invalidates active leases, prevents stale completion and preserves completed evidence',async()=>{
 const db=await pricingFixture();
 try{
  await newItem(db,item);await identity(db,staff);
  const job=(await db.query<{v:string}>('select public.admin_request_pricing_analysis($1) v',[item])).rows[0].v;
  await identity(db,staff,'service_role');
  let jobs=(await db.query<{v:Array<{id:string;lease_token:string;input:PricingInput}>}>('select public.claim_pricing_jobs() v')).rows[0].v;
  const result=JSON.stringify(analyzePricing(jobs[0].input));
  await db.query('select public.finish_pricing_job($1,$2,$3::jsonb)',[job,jobs[0].lease_token,result]);
  await db.exec('reset role');await db.query("update public.items set name='Changed evidence' where id=$1",[item]);
  await identity(db,staff);await db.query('select public.admin_request_pricing_analysis($1)',[item]);
  await identity(db,staff,'service_role');jobs=(await db.query<{v:Array<{id:string;lease_token:string;input:PricingInput}>}>('select public.claim_pricing_jobs() v')).rows[0].v;
  await identity(db,staff);await db.query("select public.admin_set_pricing_enabled(2,false,'Pause in-flight analysis and retain prior evidence')");
  await identity(db,staff,'service_role');
  await assert.rejects(db.query('select public.finish_pricing_job($1,$2,$3::jsonb)',[jobs[0].id,jobs[0].lease_token,JSON.stringify(analyzePricing(jobs[0].input))]),/suggestions are off/);
  assert.deepEqual((await db.query<{v:unknown[]}>('select public.claim_pricing_jobs() v')).rows[0].v,[]);
  await identity(db,staff);const snapshot=(await db.query<{v:{snapshot:string}}>('select public.admin_pricing_workspace($1) v',[item])).rows[0].v.snapshot;
  await assert.rejects(db.query('select public.admin_approve_item_price($1,$2,2000,$3,$4)',[item,snapshot,'Disabled analysis cannot drive a new decision',job]),/manual review/);
  await db.exec('reset role');
  assert.equal((await db.query<{status:string}>('select status from private.pricing_analyses where id=$1',[job])).rows[0].status,'completed');
  assert.deepEqual((await db.query<{status:string;lease_token:null}>('select status,lease_token from private.pricing_analyses where id=$1',[jobs[0].id])).rows[0],{status:'queued',lease_token:null});
  await identity(db,staff);await db.query("select public.admin_set_pricing_enabled(3,true,'Resume suggestions after verified pause test')");
  await identity(db,staff,'service_role');assert.equal((await db.query<{v:unknown[]}>('select public.claim_pricing_jobs() v')).rows[0].v.length,1);
 }finally{await db.close();}
});
