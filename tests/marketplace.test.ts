import test from 'node:test';
import assert from 'node:assert/strict';
import {marketplaceCommission,parseCadCents} from '../lib/marketplace.ts';
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
