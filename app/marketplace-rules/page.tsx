import {cookies} from 'next/headers';
import Link from 'next/link';
import {SellerRulesText} from '@/components/seller-rules-panel';
import type {SellerRulesDocument} from '@/lib/marketplace-community-types';
import {communityRpc} from '@/lib/marketplace-community';
import {isNeonStaging} from '@/lib/neon-staging';
import {createPublicClient} from '@/lib/supabase/public';
import '@/app/sell/sell.css';
export const dynamic='force-dynamic';
export default async function Page(){const fr=(await cookies()).get('shikimomo-language')?.value==='fr';let document:SellerRulesDocument|null=null;
 try{document=isNeonStaging()?await communityRpc('marketplace_policy_document',{}) as SellerRulesDocument:(await createPublicClient().rpc('marketplace_policy_document')).data;}catch{}
 return <main className="hybrid-shell" lang={fr?'fr':'en'} translate="no"><Link href={isNeonStaging()?'/staging/community':'/account/marketplace'}>← SHIKIMOMO</Link><h1>{fr?'Règles de vente directe':'Direct selling rules'}</h1>{document?<SellerRulesText document={document} fr={fr}/>:<p>{fr?'Les règles sont temporairement indisponibles.':'Rules are temporarily unavailable.'}</p>}</main>;}
