import {NextResponse} from 'next/server';
import {processStripeTestInbox} from '@/lib/stripe-test-server';
export const maxDuration=90;
export async function GET(req:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||secret.length<32||req.headers.get('authorization')!==`Bearer ${secret}`)return new Response('Unauthorized',{status:401});
  try{return NextResponse.json({outcomes:await processStripeTestInbox()},{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'stripe_test_worker_unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
