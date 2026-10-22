import {NextRequest,NextResponse} from 'next/server';
import {communityRpc} from '@/lib/marketplace-community';
import {communityRpcDefinitions,type CommunityRpc} from '@/lib/marketplace-community-types';
async function body(req:NextRequest){const reader=req.body?.getReader();if(!reader)throw new Error('Invalid request');let size=0;const chunks:Uint8Array[]=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();throw new Error('Request too large');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'origin'},{status:403});
 try{const input=await body(req);if(!input||typeof input.name!=='string'||!Object.hasOwn(communityRpcDefinitions,input.name)||!input.args||Array.isArray(input.args)||typeof input.args!=='object')throw new Error('Invalid action');
 const value=await communityRpc(input.name as CommunityRpc,input.args);return NextResponse.json({value},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){const text=error instanceof Error?error.message:'';const known=['Sign in required','Profile changed','Conversation unavailable','Item unavailable','Invalid offer','Offer unavailable','Offer already resolved','Request already used','Seller is on vacation','Bundle changed or unavailable','Message rate limit','Offer rate limit','Draft changed','Complete profile, price, photos and disclosures first'];return NextResponse.json({error:known.includes(text)?text:'Action rejected. Refresh and check the fields.'},{status:['Sign in required','sign_in_required'].includes(text)?401:400,headers:{'Cache-Control':'private, no-store'}});}
}
