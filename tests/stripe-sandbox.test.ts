import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {StripeSandbox,stripeTestConfig} from '../lib/stripe-sandbox.ts';
const config={key:'sk_test_synthetic',webhookSecret:'whsec_synthetic',account:'acct_synthetic',origin:'https://synthetic.vercel.app'};
const order='10000000-0000-4000-8000-000000000001',attempt='20000000-0000-4000-8000-000000000001';
const event={id:'evt_synthetic',livemode:false,type:'checkout.session.completed',data:{object:{id:'cs_test_synthetic'}}} as unknown as Stripe.Event;
const paid=()=>({id:'cs_test_synthetic',livemode:false,mode:'payment',status:'complete',payment_status:'paid',currency:'cad',amount_total:4000,metadata:{order_id:order,attempt_id:attempt},client_reference_id:order,payment_intent:{id:'pi_synthetic',livemode:false,status:'succeeded',currency:'cad',amount:4000,amount_received:4000,metadata:{order_id:order,attempt_id:attempt}}});
function client(){const sdk=new Stripe(config.key);Object.assign(sdk.accounts,{retrieve:async()=>({id:config.account,country:'CA'})});return {sdk,adapter:new StripeSandbox(config,sdk)};}
test('sandbox configuration refuses production, live credentials and unapproved origins',()=>{
 const env={VERCEL_ENV:'preview',NEXT_PUBLIC_APP_ENV:'staging',STRIPE_TEST_ENABLED:'true',NEXT_PUBLIC_STAGING_BACKEND:'neon',SHIKIMOMO_NEON_STAGING:'true',STRIPE_TEST_SECRET_KEY:config.key,STRIPE_TEST_WEBHOOK_SECRET:config.webhookSecret,STRIPE_TEST_PLATFORM_ACCOUNT:config.account,STRIPE_TEST_APP_ORIGIN:config.origin};
 assert.equal(stripeTestConfig(env).account,config.account);
 for(const extra of [{VERCEL_ENV:'production'},{STRIPE_TEST_SECRET_KEY:'sk_live_synthetic'},{STRIPE_TEST_APP_ORIGIN:'https://shikimomo.com'},{STRIPE_TEST_ENABLED:'false'},{STRIPE_TEST_WEBHOOK_SECRET:''}])assert.throws(()=>stripeTestConfig({...env,...extra}));
});
test('actual Stripe verifier rejects tampered, expired, wrong-secret and wrong-account event envelopes',()=>{
 const {sdk,adapter}=client(),raw=JSON.stringify(event);const signature=sdk.webhooks.generateTestHeaderString({payload:raw,secret:config.webhookSecret});
 assert.equal(adapter.verifyEnvelope(Buffer.from(raw),signature).event.id,event.id);
 assert.throws(()=>adapter.verifyEnvelope(Buffer.from(raw+' '),signature));
 const old=sdk.webhooks.generateTestHeaderString({payload:raw,secret:config.webhookSecret,timestamp:Math.floor(Date.now()/1000)-400});assert.throws(()=>adapter.verifyEnvelope(Buffer.from(raw),old));
 for(const extra of [{account:'acct_other'},{livemode:true}]){const body=JSON.stringify({...event,...extra});assert.throws(()=>adapter.verifyEnvelope(Buffer.from(body),sdk.webhooks.generateTestHeaderString({payload:body,secret:config.webhookSecret})));}
});
test('successful payment requires provider retrieval and matching order, cents, currency and settled intent',async()=>{
 const {sdk,adapter}=client();let data=paid();Object.assign(sdk.checkout.sessions,{retrieve:async()=>data});
 assert.equal((await adapter.paymentEvidence(event,'a'.repeat(64)))?.amountCents,4000);
 for(const mutation of [{currency:'usd'},{payment_status:'unpaid'},{livemode:true},{metadata:{order_id:attempt,attempt_id:attempt}},{amount_total:3999}]){data={...paid(),...mutation} as ReturnType<typeof paid>;await assert.rejects(adapter.paymentEvidence(event,'a'.repeat(64)));}
 data=paid();data.payment_intent.amount_received=3999;await assert.rejects(adapter.paymentEvidence(event,'a'.repeat(64)));
 Object.assign(sdk.accounts,{retrieve:async()=>({id:'acct_other',country:'CA'})});await assert.rejects(adapter.paymentEvidence(event,'a'.repeat(64)),/account_mismatch/);
});
test('checkout preserves stable idempotency and CAD, and never transfers seller money on payment',async()=>{
 const {sdk,adapter}=client();let payload:Record<string,unknown>={},options:unknown;
 Object.assign(sdk.checkout.sessions,{create:async(p:Record<string,unknown>,o:unknown)=>{payload=p;options=o;return{id:'cs_test_synthetic',livemode:false,currency:'cad',amount_total:4000,url:'https://checkout.stripe.com/c/pay/cs_test_synthetic'};}});
 await adapter.createSession({orderId:order,attemptId:attempt,idempotencyKey:attempt,totalCents:4000,expiresAt:Math.floor(Date.now()/1000)+2100,currency:'CAD'});
 assert.deepEqual(options,{idempotencyKey:attempt});assert.equal(payload.mode,'payment');assert.equal((payload.payment_intent_data as Record<string,unknown>).transfer_data,undefined);assert.deepEqual(payload.adaptive_pricing,{enabled:false});assert.match(String(payload.success_url),/\/staging\/payments\?order=/);
});
test('new sellers use Accounts v2 recipient onboarding with stable keys and provider-hosted details',async()=>{
 const {sdk,adapter}=client();let accountPayload:Record<string,unknown>={},accountOptions:unknown,linkPayload:Record<string,unknown>={};
 Object.assign(sdk.accounts,{create:async()=>{throw new Error('Legacy account creation must not run');}});
 Object.assign(sdk.v2.core.accounts,{create:async(p:Record<string,unknown>,o:unknown)=>{accountPayload=p;accountOptions=o;return{id:'acct_synthetic',livemode:false};}});
 Object.assign(sdk.v2.core.accountLinks,{create:async(p:Record<string,unknown>)=>{linkPayload=p;return{url:'https://connect.stripe.com/setup/test',livemode:false};}});
 assert.equal(await adapter.createSeller(attempt,`shikimomo-sandbox-${attempt}@example.com`),'acct_synthetic');assert.deepEqual(accountOptions,{idempotencyKey:`seller-v2-${attempt}`});
 assert.deepEqual(accountPayload.identity,{country:'CA'});assert.deepEqual(accountPayload.configuration,{recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}});
 assert.equal(accountPayload.contact_email,`shikimomo-sandbox-${attempt}@example.com`);assert.equal(accountPayload.identity_verification,undefined);
 assert.equal((await adapter.onboarding('acct_synthetic')).url,'https://connect.stripe.com/setup/test');assert.equal(linkPayload.account,'acct_synthetic');
 assert.deepEqual(linkPayload.use_case,{type:'account_onboarding',account_onboarding:{refresh_url:`${config.origin}/staging/payments`,return_url:`${config.origin}/staging/payments`}});
 Object.assign(sdk.v2.core.accountLinks,{create:async()=>({url:'https://unapproved.example/setup',livemode:false})});await assert.rejects(adapter.onboarding('acct_synthetic'),/account_mismatch/);
 Object.assign(sdk.v2.core.accounts,{create:async()=>({id:'acct_synthetic',livemode:true})});await assert.rejects(adapter.createSeller(attempt,`shikimomo-sandbox-${attempt}@example.com`),/account_mismatch/);
});
