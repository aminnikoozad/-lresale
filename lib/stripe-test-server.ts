import 'server-only';
import {neon} from '@neondatabase/serverless';
import {cookies} from 'next/headers';
import {stripeTestConfig,StripeSandbox,type StripeTestEvidence} from './stripe-sandbox';
import {stagingActors,type StagingActor} from './neon-staging';

export function stripeSandbox(){return new StripeSandbox(stripeTestConfig(process.env));}
function db(){
  stripeTestConfig(process.env);
  const value=process.env.SHIKIMOMO_STAGING_DATABASE_URL;if(!value)throw new Error('stripe_test_disabled');
  const u=new URL(value);if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname.endsWith('.neon.tech')||u.pathname!=='/shikimomo_staging'||u.username!=='staging_gateway')throw new Error('stripe_test_disabled');
  return neon(value);
}
export async function stripeTestActor(){const key=(await cookies()).get('shikimomo-stage-actor')?.value;const actor:StagingActor=key==='b'?'b':'a';return {id:stagingActors[actor],actor};}
export async function beginTestCheckout(order:string){
  const {id}=await stripeTestActor(),sql=db();
  const r=await sql.transaction([sql`select public.assert_synthetic_staging()`,sql`select set_config('request.jwt.claims',${JSON.stringify({sub:id,role:'authenticated',is_anonymous:false})},true)`,sql`set local role authenticated`,sql`select public.begin_stripe_test_checkout(${order}::uuid) as value`]);
  return r[3][0].value;
}
export async function beginTestSeller(){
  const {id}=await stripeTestActor(),sql=db();
  const r=await sql.transaction([sql`select public.assert_synthetic_staging()`,sql`select set_config('request.jwt.claims',${JSON.stringify({sub:id,role:'authenticated',is_anonymous:false})},true)`,sql`set local role authenticated`,sql`select public.begin_stripe_test_seller() as value`]);
  return {user:id,...r[3][0].value};
}
type Operation =
 | {name:'bindSession';attempt:string;session:string}
 | {name:'bindSeller';user:string;request:string;account:string}
 | {name:'receive';event:string;eventType:string;digest:string;object:string}
 | {name:'claim';event?:string}
 | {name:'state';event:string}
 | {name:'finish';event:string;lease:string;evidence:StripeTestEvidence|null;error:string|null};
export async function stripeTestRpc(op:Operation){
  const sql=db();
  const command=op.name==='bindSession'?sql`select public.bind_stripe_test_checkout(${op.attempt}::uuid,${op.session}) as value`
    :op.name==='bindSeller'?sql`select public.bind_stripe_test_seller(${op.user}::uuid,${op.request}::uuid,${op.account}) as value`
    :op.name==='receive'?sql`select public.receive_stripe_test_event(${op.event},${op.eventType},${op.digest},${op.object}) as value`
    :op.name==='claim'?op.event?sql`select public.claim_stripe_test_event(${op.event}) as value`:sql`select public.claim_stripe_test_events(1) as value`
    :op.name==='state'?sql`select public.stripe_test_event_state(${op.event}) as value`
    :sql`select public.finish_stripe_test_event(${op.event},${op.lease}::uuid,${JSON.stringify(op.evidence)}::jsonb,${op.error}) as value`;
  const r=await sql.transaction([sql`select public.assert_synthetic_staging()`,sql`select set_config('request.jwt.claims','{"role":"service_role","is_anonymous":false}',true)`,command]);return r[2][0].value;
}
export async function processStripeTestInbox(event?:string){
  const client=stripeSandbox();
  const events=await stripeTestRpc({name:'claim',event}) as Array<{provider_event_id:string;payload_sha256:string;lease_token:string;provider_object_id:string;source_event_type:string}>;
  const results=[];
  for(const row of events){
    let evidence:StripeTestEvidence|null;
    try{
      const event=await client.stripe.events.retrieve(row.provider_event_id);
      if(event.id!==row.provider_event_id||event.type!==row.source_event_type||(event.data.object as {id?:string}).id!==row.provider_object_id)throw new Error('stripe_event_mismatch');
      evidence=await client.paymentEvidence(event,row.payload_sha256);
    }catch(error){
      const permanent=error instanceof Error&&['stripe_event_scope','stripe_event_mismatch','stripe_session_mismatch','stripe_payment_mismatch','stripe_account_mismatch'].includes(error.message);
      results.push(await stripeTestRpc({name:'finish',event:row.provider_event_id,lease:row.lease_token,evidence:null,error:permanent?'evidence_rejected':'provider_unavailable'}));continue;
    }
    results.push(await stripeTestRpc({name:'finish',event:row.provider_event_id,lease:row.lease_token,evidence,error:null}));
  }
  return results;
}
