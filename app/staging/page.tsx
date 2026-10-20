import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isNeonStaging,stagingDrafts } from "@/lib/neon-staging";
import type { MarketplaceDraft } from "@/lib/marketplace";
import { DirectDraftEditor } from "@/components/direct-draft-editor";
import { saveNeonDraft,selectStagingActor } from "./actions";
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
    <h1>{t("Direct-sale rehearsal","Essai de vente directe")}</h1>
    <p className="hybrid-notice">{t("Synthetic data only. This preview runs the actual draft RPCs and database permissions on Neon. Test identities are simulated; Supabase sign-in, photo storage, payments and shipping are not exercised here.","Données fictives seulement. Cet aperçu exécute les véritables RPC de brouillon et les autorisations de base de données sur Neon. Les identités sont simulées; la connexion Supabase, le stockage des photos, les paiements et l’expédition ne sont pas testés ici.")}</p>
    <form action={selectStagingActor} className="hybrid-draft-form"><label>{t("Synthetic seller","Vendeur fictif")}<select name="actor" defaultValue={actor}><option value="a">Seller A / Vendeur A</option><option value="b">Seller B / Vendeur B</option></select></label><button className="hybrid-button" type="submit">{t("Switch test identity","Changer d’identité de test")}</button><p>{t("Switch sellers to verify that drafts remain isolated.","Changez de vendeur pour vérifier que les brouillons restent isolés.")}</p></form>
    <p><Link href="/sell">{t("Compare selling methods","Comparer les modes de vente")}</Link></p>
    {params.saved && <p role="status" className="hybrid-success">{t("Saved to the isolated staging database.","Enregistré dans la base de données de test isolée.")}</p>}
    {params.error && <p role="alert" className="hybrid-error">{t("Save rejected. Check the fields or refresh if the listing version changed.","Enregistrement refusé. Vérifiez les champs ou actualisez la page si la version a changé.")}</p>}
    {available?<div className="hybrid-drafts"><DirectDraftEditor fr={fr} action={saveNeonDraft}/>{drafts.map(d=><DirectDraftEditor key={d.id} fr={fr} action={saveNeonDraft} draft={d}/>)}</div>:<p role="alert">{t("Staging database is unavailable.","La base de données de test est indisponible.")}</p>}
  </main>;
}
