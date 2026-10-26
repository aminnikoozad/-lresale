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
 return <main className="hybrid-shell" lang={fr?'fr':'en'} translate="no"><Link href={isNeonStaging()?'/staging/community':'/account/marketplace'}>← SHIKIMOMO</Link><h1>{fr?'Politique de vente personnelle':'Personal-selling policy'}</h1><p>{fr?'Vous ajoutez vos photos et votre annonce, choisissez le prix, gardez l’article et préparez son expédition. Shikimomo fournit la plateforme, la visibilité de l’annonce et la révision du contenu. Cette révision n’est pas une inspection physique de l’article.':'You upload your photos and listing, choose the price, keep the item and prepare its shipping. Shikimomo provides the platform, listing visibility and content review. Content review is not a physical inspection of the item.'}</p><p>{fr?'Les conditions de collecte et les commissions des articles confiés à Shikimomo ne s’appliquent pas à ces annonces. Les responsabilités propres à votre annonce figurent ci-dessous. Les conditions d’expédition, de retour, de paiement et de versement seront présentées séparément avant l’ouverture des achats réels.':'Collection conditions and managed-sale commission rates do not apply to these listings. Your listing responsibilities appear below. Shipping, return, payment and payout terms will be presented separately before real purchases open.'}</p>{document?<SellerRulesText document={document} fr={fr}/>:<p>{fr?'Les règles sont temporairement indisponibles.':'Rules are temporarily unavailable.'}</p>}</main>;}
