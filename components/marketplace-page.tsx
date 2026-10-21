import Link from 'next/link';
import {cookies} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {MarketplaceWorkspace} from './marketplace-workspace';
import {communityRpc} from '@/lib/marketplace-community';
import {isNeonStaging} from '@/lib/neon-staging';
import type {TradeWorkspace,SellerStore} from '@/lib/marketplace-community-types';
import '@/app/sell/sell.css';
export async function MarketplacePage({params,stage}:{params:Record<string,string|undefined>;stage:boolean}){
 if(stage&&!isNeonStaging())notFound();
 const fr=(await cookies()).get('shikimomo-language')?.value==='fr';const base=stage?'/staging/community':'/account/marketplace';
 const thread=params.thread&&/^[0-9a-f-]{36}$/i.test(params.thread)?params.thread:null;
 const before=params.before&&!Number.isNaN(Date.parse(params.before))?params.before:null;
 let data:TradeWorkspace;let store:SellerStore|null=null;
 try{data=await communityRpc('marketplace_workspace',{p_thread:thread,p_before:before}) as TradeWorkspace;
 if(data.thread?.store)store=await communityRpc('marketplace_store',{p_seller:data.thread.store,p_page:1}) as SellerStore;
 }catch(error){if(error instanceof Error&&error.message==='sign_in_required')redirect(`/login?next=${base}`);return <main className="hybrid-shell"><h1>{fr?'Messages et boutique':'Messages & shop'}</h1><p role="alert">{fr?'Impossible de charger cet espace. Vérifiez votre connexion et la disponibilité de la conversation.':'Could not load this workspace. Check your sign-in and conversation availability.'}</p><Link href={base}>{fr?'Réessayer':'Try again'}</Link></main>;}
 return <main className="hybrid-shell"><Link href={stage?'/staging':'/account/seller'}>← {fr?'Options de vente':'Selling options'}</Link><h1>{fr?'Messages, offres et boutique':'Messages, offers & shop'}</h1>{stage&&<p className="hybrid-notice">{fr?'Identités fictives de test. Aucun paiement ni envoi réel.':'Synthetic test identities. No real payments or shipping.'}</p>}<MarketplaceWorkspace data={data} store={store} fr={fr} base={base} older={data.threads.length===30?data.threads.at(-1)?.updated_at:undefined}/></main>;
}
