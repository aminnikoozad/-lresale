import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {type SellerStatement,statementMoney,statementEvent} from "@/lib/seller-statements";
import "./statements.css";
export const dynamic="force-dynamic";
export default async function Statements({searchParams}:{searchParams:Promise<{mode?:string;page?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login?next=/account/seller/statements');
 const fr=(await cookies()).get('shikimomo-language')?.value==='fr',t=(en:string,french:string)=>fr?french:en;
 const params=await searchParams;const mode=['managed_consignment','peer_to_peer'].includes(params.mode??'')?params.mode!:null;
 const page=Math.min(10000,Math.max(1,Number.parseInt(params.page??'1',10)||1));
 const {data,error}=await db.rpc('my_seller_statements',{p_id:null,p_page:page,p_mode:mode});const statements=(data??[]) as SellerStatement[];
 return <main className="account-shared-page" translate="no" lang={fr?'fr':'en'}><h1>{t('Sales statements','Relevés de vente')}</h1><p>{t('Automatically created from confirmed sales records, with the selling method and amounts saved at the time. Emails go to your verified account address. A sales statement does not confirm a bank transfer.','Créés automatiquement à partir des ventes confirmées, avec leur méthode et les montants enregistrés. Les courriels sont envoyés à votre adresse de compte vérifiée. Un relevé de vente ne confirme pas un virement bancaire.')}</p>
 <nav className="statement-tabs" aria-label={t('Selling method','Méthode de vente')}><Link href="/account/seller/statements">{t('All statements','Tous les relevés')}</Link><Link href="?mode=managed_consignment">{t('Sold by Shikimomo','Vendu par Shikimomo')}</Link><Link href="?mode=peer_to_peer">{t('Personal sales','Ventes personnelles')}</Link></nav>
 {error?<p role="alert">{t('Statements are temporarily unavailable.','Les relevés sont temporairement indisponibles.')}</p>:!statements.length?<p>{t('No statements yet. Your first verified sale will create one automatically.','Aucun relevé. Votre première vente vérifiée en créera un automatiquement.')}</p>:<ul className="statement-list">{statements.map(s=><li key={s.id}><Link href={`/account/seller/statements/${s.id}`}><strong>{s.number}</strong></Link><p>{s.snapshot.itemName}</p><p>{s.sale_mode==='peer_to_peer'?t('Personal sale','Vente personnelle'):t('Sold by Shikimomo','Vendu par Shikimomo')} · {statementEvent(s.event,fr)}</p><p>{t('Seller earnings','Revenus du vendeur')}: {statementMoney(s.snapshot.sellerCents,fr)} · {new Date(s.issued_at).toLocaleDateString(fr?'fr-CA':'en-CA',{timeZone:'America/Toronto'})}</p>{s.reversed&&<p>{t('This sale has been reversed.','Cette vente a été annulée.')}</p>}</li>)}</ul>}
 <nav className="statement-tabs">{page>1&&<Link href={`?page=${page-1}${mode?'&mode='+mode:''}`}>{t('Previous','Précédent')}</Link>}{statements.length===50&&<Link href={`?page=${page+1}${mode?'&mode='+mode:''}`}>{t('Next','Suivant')}</Link>}</nav><Link href="/account/seller/earnings">{t('Back to earnings','Retour aux revenus')}</Link></main>;
}
