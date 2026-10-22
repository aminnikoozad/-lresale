import {NextRequest,NextResponse} from 'next/server';
import {communityRpc} from '@/lib/marketplace-community';
import {communityRpcDefinitions,type CommunityRpc} from '@/lib/marketplace-community-types';
import {readBoundedJson,RequestBodyTooLarge} from "@/lib/bounded-request";
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'origin'},{status:403});
 try{const input=await readBoundedJson(req,16000) as {name?:unknown;args?:unknown};if(!input||typeof input.name!=='string'||!Object.hasOwn(communityRpcDefinitions,input.name)||!input.args||Array.isArray(input.args)||typeof input.args!=='object')throw new Error('Invalid action');
 const value=await communityRpc(input.name as CommunityRpc,input.args as Record<string,unknown>);return NextResponse.json({value},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){const text=error instanceof Error?error.message:'';const known=['Sign in required','Profile changed','Conversation unavailable','Item unavailable','Invalid offer','Offer unavailable','Offer already resolved','Request already used','Seller is on vacation','Bundle changed or unavailable','Message rate limit','Offer rate limit','Draft changed','Complete profile, price, photos and disclosures first'];return NextResponse.json({error:known.includes(text)?text:'Action rejected. Refresh and check the fields.'},{status:error instanceof RequestBodyTooLarge?413:['Sign in required','sign_in_required'].includes(text)?401:400,headers:{'Cache-Control':'private, no-store'}});}
}
