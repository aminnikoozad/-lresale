import {NextRequest,NextResponse} from 'next/server';
import {readBoundedJson,RequestBodyTooLarge} from '@/lib/bounded-request';
import {beginTestCheckout,stripeSandbox,stripeTestRpc} from '@/lib/stripe-test-server';
const headers={'Cache-Control':'private, no-store'};
export async function POST(req:NextRequest){
  if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'origin'},{status:403,headers});
  try{
    const client=stripeSandbox();
    if(process.env.STRIPE_TEST_CHECKOUT_ENABLED!=='true')throw new Error('stripe_test_checkout_disabled');
    if(req.nextUrl.origin!==client.config.origin)throw new Error('stripe_test_disabled');
    const body=await readBoundedJson(req,1024) as {order?:unknown};
    if(typeof body?.order!=='string'||!/^[0-9a-f-]{36}$/i.test(body.order))throw new Error('invalid_order');
    const input=await beginTestCheckout(body.order);
    const session=await client.createSession(input);
    await stripeTestRpc({name:'bindSession',attempt:input.attemptId,session:session.checkoutId});
    return NextResponse.json({url:session.url},{headers});
  }catch(error){return NextResponse.json({error:error instanceof Error&&error.message==='stripe_test_disabled'?'stripe_test_disabled':'test_checkout_unavailable'},{status:error instanceof RequestBodyTooLarge?413:503,headers});}
}
