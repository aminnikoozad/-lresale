import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import {SellerStoreView} from '@/components/seller-store';
import {createClient} from '@/lib/supabase/server';
import {communityRpc} from '@/lib/marketplace-community';
import {isNeonStaging} from '@/lib/neon-staging';
import type {SellerStore} from '@/lib/marketplace-community-types';
import '@/app/sell/sell.css';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}){
 const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))notFound();const stage=isNeonStaging(),fr=(await cookies()).get('shikimomo-language')?.value==='fr';const page=Math.max(1,Math.min(10000,Number((await searchParams).page)||1));
 let data:SellerStore|null=null;try{if(stage)data=await communityRpc('marketplace_store',{p_seller:id,p_page:page}) as SellerStore;else{const client=await createClient();const result=await client.rpc('marketplace_store',{p_seller:id,p_page:page});if(!result.error)data=result.data;}}catch{}
 if(!data)notFound();return <SellerStoreView store={data} fr={fr} stage={stage} page={page}/>;
}
