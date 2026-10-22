import test from 'node:test';
import assert from 'node:assert/strict';
import {marketplaceCommission,parseCadCents,parseDraftFields,parseDraftAction} from '../lib/marketplace.ts';
import {resolveSupabaseEnvironment,productionSupabaseUrl} from '../lib/supabase/environment.ts';
const proposal={version:1,commissionBps:1500,minimumCommissionCents:150};
test('commission applies once to the seller suborder with deterministic integer rounding',()=>{
 assert.deepEqual(marketplaceCommission(4000,proposal),{commissionCents:600,sellerNetCents:3400,policyVersion:1});
 assert.equal(marketplaceCommission(800,proposal).commissionCents,150);
 assert.equal(marketplaceCommission(1600,proposal).commissionCents,240); // NOT two minimum fees.
 assert.equal(marketplaceCommission(1003,proposal).commissionCents,150);
 assert.equal(marketplaceCommission(1010,proposal).commissionCents,152);
 assert.equal(marketplaceCommission(0,proposal).commissionCents,0);
 for(const n of [-1,1.1,NaN,Infinity,100000001]) assert.throws(()=>marketplaceCommission(n,proposal));
});
test('draft form preserves measured centimetres, unknowns and subcategory without accepting guessed or malformed numbers',()=>{
 const form=new FormData();form.set('subcategory','Shirts');form.set('measurement_chest','51,5');form.set('measurement_length','70');
 const fields=parseDraftFields(form);
 assert.equal(fields.subcategory,'Shirts');assert.deepEqual(fields.measurements,{chest:51.5,length:70});assert.equal(fields.price_cents,null);
 for(const value of ['NaN','-1','1e2','0','501','1.234']){form.set('measurement_chest',value);assert.throws(()=>parseDraftFields(form));}
});
test('listing actions require UUIDs, versions, allowed operations and explicit copy/off-platform confirmation',()=>{
 const form=new FormData();form.set('id','10000000-0000-4000-8000-000000000001');form.set('request','20000000-0000-4000-8000-000000000001');form.set('version','2');form.set('operation','archive');
 assert.equal(parseDraftAction(form).operation,'archive');
 for(const op of ['copy','sold_elsewhere']){form.set('operation',op);assert.throws(()=>parseDraftAction(form));form.set('confirmed','on');assert.equal(parseDraftAction(form).operation,op);form.delete('confirmed');}
 form.set('operation','payout');assert.throws(()=>parseDraftAction(form));
});
test('CAD parser avoids floating point input and accepts French decimal commas',()=>{
 for(const [value,cents] of [['40',4000],['8.01',801],['40,50',4050],['',null]] as const) assert.equal(parseCadCents(value),cents);
 for(const value of ['0','-2','1.001','NaN','1e3','40.00 CAD']) assert.throws(()=>parseCadCents(value));
});
test('preview cannot fall back to production; project/key must be configured as a pair',()=>{
 assert.equal(resolveSupabaseEnvironment({}).url,productionSupabaseUrl);
 assert.throws(()=>resolveSupabaseEnvironment({VERCEL_ENV:'preview'}));
 assert.throws(()=>resolveSupabaseEnvironment({NEXT_PUBLIC_APP_ENV:'staging',NEXT_PUBLIC_SUPABASE_URL:productionSupabaseUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}));
 assert.throws(()=>resolveSupabaseEnvironment({NEXT_PUBLIC_SUPABASE_URL:'https://stage.supabase.co'}));
 assert.throws(()=>resolveSupabaseEnvironment({NEXT_PUBLIC_SUPABASE_URL:'https://stage.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'}));
 assert.equal(resolveSupabaseEnvironment({VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:'https://stage.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}).url,'https://stage.supabase.co');
});

test('Neon rehearsal disables Supabase rather than reusing production and is rejected for production deployments',()=>{
 const env={NEXT_PUBLIC_APP_ENV:'staging',NEXT_PUBLIC_STAGING_BACKEND:'neon',VERCEL_ENV:'preview'};
 assert.equal(resolveSupabaseEnvironment(env).url,'https://disabled.invalid');
 assert.throws(()=>resolveSupabaseEnvironment({...env,VERCEL_ENV:'production'}));
 assert.throws(()=>resolveSupabaseEnvironment({...env,NEXT_PUBLIC_APP_ENV:'production'}));
});
