import {NextRequest,NextResponse} from 'next/server';
import {beginTestSeller,stripeSandbox,stripeTestRpc} from '@/lib/stripe-test-server';
const headers={'Cache-Control':'private, no-store'};
export async function POST(req:NextRequest){
  if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'origin'},{status:403,headers});
  try{
    const client=stripeSandbox();if(req.nextUrl.origin!==client.config.origin)throw new Error('stripe_test_disabled');
    const binding=await beginTestSeller();
    const account=binding.accountId??await client.createSeller(binding.requestId);
    await stripeTestRpc({name:'bindSeller',user:binding.user,request:binding.requestId,account});
    const link=await client.onboarding(account);
    return NextResponse.json({url:link.url},{headers});
  }catch{return NextResponse.json({error:'stripe_test_seller_unavailable'},{status:503,headers});}
}
