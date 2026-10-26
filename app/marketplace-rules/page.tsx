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
 return <main className="hybrid-shell" lang={fr?'fr':'en'} translate="no"><Link href={isNeonStaging()?'/staging/community':'/account/marketplace'}>← SHIKIMOMO</Link><h1>{fr?'Politique de vente personnelle':'Personal-selling policy'}</h1><p>{fr?'Vous ajoutez vos photos et votre annonce, choisissez le prix, gardez l’article et préparez son expédition. Shikimomo fournit la plateforme, la visibilité de l’annonce et la révision du contenu. Cette révision n’est pas une inspection physique de l’article.':'You upload your photos and listing, choose the price, keep the item and prepare its shipping. Shikimomo provides the platform, listing visibility and content review. Content review is not a physical inspection of the item.'}</p><p>{fr?'Les conditions de collecte et les commissions des articles confiés à Shikimomo ne s’appliquent pas à ces annonces. Les responsabilités propres à votre annonce et aux problèmes de transaction figurent ci-dessous; les conditions nécessaires à un achat réel seront présentées avant son ouverture.':'Collection conditions and managed-sale commission rates do not apply to these listings. Responsibilities for your listing and transaction issues appear below; terms required for real purchases will be presented before purchases open.'}</p>{document?<SellerRulesText document={document} fr={fr}/>:<p>{fr?'Les règles sont temporairement indisponibles.':'Rules are temporarily unavailable.'}</p>}</main>;}
