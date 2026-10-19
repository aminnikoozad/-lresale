import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const source=fs.readFileSync(new URL('../app/admin/postal/actions.ts',import.meta.url),'utf8');
function setup({permission=true,mfa=true,carrier=true,production=true,failure=null}={}){
 let calls=0;
 class CarrierError extends Error { constructor(code){super('Redacted');this.code=code;} }
 const modules={
  'next/navigation':{redirect:path=>{throw Error(`redirect:${path}`)}},'next/cache':{revalidatePath:()=>{}},
  '@/lib/admin-auth':{requireAdmin:async()=>({supabase:{},access:{can_manage_shipping:permission,has_aal2:mfa}})},
  '@/lib/postal-server':{postalReadiness:()=>({carrier,production,storage:true})},
  '@/lib/postal':{weightBand:()=>1,postalCode:value=>value.toUpperCase().replaceAll(' ',''),validPostal:value=>/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(value)},
  '@/lib/canada-post':{CanadaPostError:CarrierError,canadaPostRates:async()=>{calls++;if(failure)throw failure==='unknown'?Error('private token'):new CarrierError(failure);return [{serviceCode:'DOM.RP',serviceName:'Regular Parcel',totalCents:1234,taxCents:59,transitDays:3}];}},
 };
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,require:name=>modules[name],process:{env:{CANADA_POST_CLIENT_ID:'synthetic',CANADA_POST_CLIENT_SECRET:'synthetic'}},Date,URLSearchParams});
 return {run:form=>mod.exports.testCanadaPostConnection({status:'idle'},form),calls:()=>calls};
}
function form(){const value=new FormData();for(const [key,text] of Object.entries({origin:'H2X1Y4',destination:'K1A0B1',weight:'500',length:'300',width:'200',height:'100',locale:'en'}))value.set(key,text);return value;}
test('Postal rate diagnostics require shipping permission and MFA before any carrier call',async()=>{
 for(const options of [{permission:false},{mfa:false}]){const s=setup(options);await assert.rejects(s.run(form()),/redirect/);assert.equal(s.calls(),0);}
});
test('Missing credentials or production mode fail closed without calling the carrier',async()=>{
 for(const options of [{carrier:false},{production:false}]){const s=setup(options);assert.equal((await s.run(form())).status,'not_configured');assert.equal(s.calls(),0);}
});
test('Invalid test routes and package measurements never reach the carrier',async()=>{
 for(const [key,value] of [['origin',''],['destination','not-a-postcode'],['weight','0'],['weight','30001'],['length','2001'],['height','1.5']]){const s=setup();const f=form();f.set(key,value);assert.equal((await s.run(f)).status,'invalid_input');assert.equal(s.calls(),0);}
});
test('Admin sees successful rate results or safe categorized errors, never private carrier details',async()=>{
 const s=setup();const result=await s.run(form());assert.equal(result.status,'ok');assert.equal(result.rates[0].totalCents,1234);assert.equal(s.calls(),1);
 for(const failure of ['authentication','rate_limited','invalid_request','unknown']){const s=setup({failure});const result=await s.run(form());assert.equal(result.status,failure==='unknown'?'unavailable':failure);assert.ok(!JSON.stringify(result).includes('private token'));}
});
