import {NextResponse} from 'next/server';
import {readBoundedBytes,RequestBodyTooLarge} from '@/lib/bounded-request';
import {stripeSandbox,stripeTestRpc} from '@/lib/stripe-test-server';
const headers={'Cache-Control':'private, no-store'};
export async function POST(req:Request){
  let client;try{client=stripeSandbox();}catch{return NextResponse.json({error:'stripe_test_disabled'},{status:503,headers});}
  let verified;
  try{verified=client.verifyEnvelope(await readBoundedBytes(req,256000),req.headers.get('stripe-signature')??'');}
  catch(error){return NextResponse.json({error:'invalid_webhook'},{status:error instanceof RequestBodyTooLarge?413:400,headers});}
  try{
    const object=verified.event.data.object as {id?:string};if(!object.id)throw new Error('invalid_event');
    // Commit the receipt before any provider lookup, order mutation or slow processing.
    await stripeTestRpc({name:'receive',event:verified.event.id,eventType:verified.event.type,digest:verified.digest,object:object.id});
    return NextResponse.json({received:true},{headers});
  }catch{return NextResponse.json({error:'inbox_unavailable'},{status:503,headers});}
}
