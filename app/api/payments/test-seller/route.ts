import {NextRequest,NextResponse} from 'next/server';
import {beginTestSeller,stripeSandbox,stripeTestRpc} from '@/lib/stripe-test-server';
const headers={'Cache-Control':'private, no-store'};
export async function POST(req:NextRequest){
  if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'origin'},{status:403,headers});
  let step='configuration';
  try{
    const client=stripeSandbox();if(req.nextUrl.origin!==client.config.origin)throw new Error('stripe_test_disabled');
    step='database_owner';
    const binding=await beginTestSeller();
    step='provider_account';
    const account=binding.accountId??await client.createSeller(binding.requestId,`shikimomo-sandbox-${binding.user}@example.com`);
    step='database_binding';
    await stripeTestRpc({name:'bindSeller',user:binding.user,request:binding.requestId,account});
    step='provider_link';
    const link=await client.onboarding(account);
    return NextResponse.json({url:link.url},{headers});
  }catch(error){
    const e=error as {type?:unknown;code?:unknown;statusCode?:unknown};
    const token=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(v)?v:undefined;
    console.warn('stripe_test_seller_failed',{step,type:token(e?.type),code:token(e?.code),status:typeof e?.statusCode==='number'?e.statusCode:undefined});
    return NextResponse.json({error:'stripe_test_seller_unavailable'},{status:503,headers});
  }
}
