import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isNeonStaging,stagingDrafts } from "@/lib/neon-staging";
import type { MarketplaceDraft } from "@/lib/marketplace";
import { DirectDraftList } from "@/components/direct-draft-list";
import { SellingMethodOptions } from "@/components/selling-method-options";
import { saveNeonDraft,manageNeonDraft,selectStagingActor } from "./actions";
import "@/app/sell/sell.css";
export const dynamic="force-dynamic";
export const metadata={title:"SHIKIMOMO — SQL staging",robots:{index:false,follow:false}};
export default async function StagingPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  if(!isNeonStaging()) notFound();
  const jar=await cookies();const fr=jar.get("shikimomo-language")?.value==="fr";
  const actor=jar.get("shikimomo-stage-actor")?.value==="b"?"b":"a";
  const t=(en:string,french:string)=>fr?french:en;
  const params=await searchParams;let drafts:MarketplaceDraft[]=[];let available=true;
  try{drafts=await stagingDrafts(actor);}catch{available=false;}
  return <main className="hybrid-shell" translate="no" lang={fr?"fr":"en"}>
    <p className="hybrid-eyebrow">SHIKIMOMO · {t("TEST ENVIRONMENT","ENVIRONNEMENT DE TEST")}</p>
    <h1>{t("Sell your clothes","Vendez vos vêtements")}</h1>
    <p className="hybrid-notice">{t("Synthetic seller account preview on Neon. Identities are simulated; real sign-in, managed pickup and shipping are not exercised here. Stripe sandbox payments are tested separately; no live payments. Photo upload stays disabled until the private storage connection is authorized and configured.","Aperçu de compte vendeur fictif sur Neon. Les identités sont simulées; la connexion réelle, la collecte gérée et l’expédition ne sont pas testées ici. Les paiements Stripe sont testés séparément dans le bac à sable; aucun paiement réel. Le téléversement reste désactivé jusqu’à l’autorisation et la configuration du stockage privé.")}</p>
    <form action={selectStagingActor} className="hybrid-draft-form"><label>{t("Synthetic seller","Vendeur fictif")}<select name="actor" defaultValue={actor}><option value="a">Seller A / Vendeur A</option><option value="b">Seller B / Vendeur B</option></select></label><button className="hybrid-button" type="submit">{t("Switch test identity","Changer d’identité de test")}</button><p>{t("Switch sellers to verify that drafts remain isolated.","Changez de vendeur pour vérifier que les brouillons restent isolés.")}</p></form>
    <p><Link href="/staging/community">{t("Messages, offers & my shop", "Messages, offres et ma boutique")}</Link></p>
    <p><Link href="/staging/finance">{t("Payments & payouts report", "Rapport des paiements et versements")}</Link></p>
    <p><Link href="/staging/payments">{t("Stripe payment sandbox", "Tests de paiement Stripe")}</Link></p>
    <p><Link href="/sell">{t("Compare selling methods","Comparer les modes de vente")}</Link></p>
    <SellingMethodOptions fr={fr} directHref="#direct-listings" managedControls={<p>{t("Bag and pickup requests remain in your existing seller account. This preview does not create collection requests.","Les demandes de sac et de collecte restent dans votre compte vendeur existant. Cet aperçu ne crée pas de demande de collecte.")}</p>}/>
    {params.saved && <p role="status" className="hybrid-success">{t("Saved to the isolated staging database.","Enregistré dans la base de données de test isolée.")}</p>}
    {params.updated && <p role="status" className="hybrid-success">{t("Listing updated in staging.","Annonce mise à jour dans l’environnement de test.")}</p>}
    {params.error && <p role="alert" className="hybrid-error">{t("Action rejected. Check the fields and confirmation, or refresh if the listing changed. Reserved or ordered inventory is locked.","Action refusée. Vérifiez les champs et la confirmation, ou actualisez si l’annonce a changé. Les articles réservés ou commandés sont verrouillés.")}</p>}
    <div id="direct-listings">{available?<DirectDraftList fr={fr} drafts={drafts} save={saveNeonDraft} manage={manageNeonDraft} page={Number(params.page??1)}/>:<p role="alert">{t("Staging database is unavailable.","La base de données de test est indisponible.")}</p>}</div>
  </main>;
}
