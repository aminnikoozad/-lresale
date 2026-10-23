import Stripe from 'stripe';
import {createHash} from 'node:crypto';

export type StripeTestConfig = {key:string; webhookSecret:string; account:string; origin:string};
export function stripeTestConfig(env:Record<string,string|undefined>):StripeTestConfig {
  if(env.VERCEL_ENV!=='preview'||env.NEXT_PUBLIC_APP_ENV!=='staging'||env.STRIPE_TEST_ENABLED!=='true'
    ||env.NEXT_PUBLIC_STAGING_BACKEND!=='neon'||env.SHIKIMOMO_NEON_STAGING!=='true') throw new Error('stripe_test_disabled');
  const key=env.STRIPE_TEST_SECRET_KEY??'',webhookSecret=env.STRIPE_TEST_WEBHOOK_SECRET??'',account=env.STRIPE_TEST_PLATFORM_ACCOUNT??'';
  const origin=new URL(env.STRIPE_TEST_APP_ORIGIN??'https://disabled.invalid');
  if(!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)||!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)||!/^acct_[A-Za-z0-9]+$/.test(account)
    ||origin.protocol!=='https:'||origin.username||origin.password||origin.origin!==env.STRIPE_TEST_APP_ORIGIN||!origin.hostname.endsWith('.vercel.app')) throw new Error('stripe_test_disabled');
  return {key,webhookSecret,account,origin:origin.origin};
}
export type TestCheckout={orderId:string;attemptId:string;idempotencyKey:string;totalCents:number;expiresAt:number;currency:'CAD'};
export type StripeTestEvidence={eventId:string;digest:string;eventType:string;attemptId:string;orderId:string;sessionId:string;paymentId:string;amountCents:number;currency:'CAD'};
export class StripeSandbox {
  readonly stripe:Stripe;
  readonly config:StripeTestConfig;
  constructor(config:StripeTestConfig,client?:Stripe){this.config=config;this.stripe=client??new Stripe(config.key,{apiVersion:'2026-09-30.endive',timeout:12000,maxNetworkRetries:1});}
  async assertPlatform(){const a=await this.stripe.accounts.retrieve(null);if(a.id!==this.config.account||a.country!=='CA')throw new Error('stripe_account_mismatch');}
  async createSession(input:TestCheckout){
    if(!Number.isSafeInteger(input.totalCents)||input.totalCents<1||input.currency!=='CAD')throw new Error('invalid_total');
    await this.assertPlatform();
    const metadata={order_id:input.orderId,attempt_id:input.attemptId};
    // Separate charges/transfers: deliberately no transfer_data or automatic seller transfer.
    const session=await this.stripe.checkout.sessions.create({mode:'payment',allowed_payment_method_types:['card'],
      client_reference_id:input.orderId,metadata,payment_intent_data:{metadata,transfer_group:input.orderId},
      adaptive_pricing:{enabled:false},expires_at:input.expiresAt,
      success_url:`${this.config.origin}/staging/payments?order=${input.orderId}`,cancel_url:`${this.config.origin}/staging/payments?order=${input.orderId}`,
      line_items:[{quantity:1,price_data:{currency:'cad',unit_amount:input.totalCents,product_data:{name:'SHIKIMOMO — synthetic order (test only)'}}}]},
      {idempotencyKey:input.idempotencyKey});
    if(session.livemode||!session.id.startsWith('cs_test_')||session.currency!=='cad'||session.amount_total!==input.totalCents||!session.url||new URL(session.url).hostname!=='checkout.stripe.com')throw new Error('stripe_session_mismatch');
    return {checkoutId:session.id,url:session.url};
  }
  verifyEnvelope(raw:Uint8Array,signature:string){
    const e=this.stripe.webhooks.constructEvent(Buffer.from(raw),signature,this.config.webhookSecret,300);
    if(e.livemode||e.account||!e.id.startsWith('evt_'))throw new Error('stripe_event_scope');
    return {event:e,digest:createHash('sha256').update(raw).digest('hex')};
  }
  async paymentEvidence(event:Stripe.Event,digest:string):Promise<StripeTestEvidence|null>{
    if(event.livemode||event.account)throw new Error('stripe_event_scope');
    if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return null;
    await this.assertPlatform();
    const source=event.data.object as Stripe.Checkout.Session;
    if(!source.id.startsWith('cs_test_'))throw new Error('stripe_session_mismatch');
    const s=await this.stripe.checkout.sessions.retrieve(source.id,{expand:['payment_intent']});
    const p=s.payment_intent;
    if(s.livemode||s.mode!=='payment'||s.status!=='complete'||s.payment_status!=='paid'||s.currency!=='cad'
      ||!p||typeof p==='string'||p.livemode||p.status!=='succeeded'||p.currency!=='cad'||p.amount_received!==s.amount_total||p.amount!==s.amount_total
      ||p.metadata.order_id!==s.metadata?.order_id||p.metadata.attempt_id!==s.metadata?.attempt_id||s.client_reference_id!==s.metadata?.order_id) throw new Error('stripe_payment_mismatch');
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuid.test(s.metadata?.order_id??'')||!uuid.test(s.metadata?.attempt_id??'')||!Number.isSafeInteger(s.amount_total))throw new Error('stripe_payment_mismatch');
    return {eventId:event.id,digest,eventType:event.type,attemptId:s.metadata!.attempt_id,orderId:s.metadata!.order_id,sessionId:s.id,paymentId:p.id,amountCents:s.amount_total!,currency:'CAD'};
  }
  async createSeller(requestId:string){
    await this.assertPlatform();
    const a=await this.stripe.accounts.create({type:'express',country:'CA',capabilities:{transfers:{requested:true}},metadata:{shikimomo_test_request:requestId}}, {idempotencyKey:`seller-${requestId}`});
    return a.id;
  }
  async onboarding(account:string){
    await this.assertPlatform();
    return this.stripe.accountLinks.create({account,type:'account_onboarding',refresh_url:`${this.config.origin}/staging/payments`,return_url:`${this.config.origin}/staging/payments`});
  }
  async refund(paymentId:string,cents:number,requestId:string){
    if(!Number.isSafeInteger(cents)||cents<1)throw new Error('invalid_total');
    await this.assertPlatform();
    const payment=await this.stripe.paymentIntents.retrieve(paymentId);
    if(payment.livemode||payment.currency!=='cad')throw new Error('stripe_payment_mismatch');
    return this.stripe.refunds.create({payment_intent:paymentId,amount:cents},{idempotencyKey:`refund-${requestId}`});
  }
}
