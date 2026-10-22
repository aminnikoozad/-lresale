import Link from "next/link";
import { SellingMethodTabs } from "@/components/selling-method-tabs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MarketplaceDraft } from "@/lib/marketplace";
import { DirectDraftList } from "@/components/direct-draft-list";
import { saveDirectDraft,manageDirectDraft } from "./actions";
import "@/app/sell/sell.css";
export const dynamic = "force-dynamic";
export default async function DirectDrafts({searchParams}: {searchParams: Promise<Record<string,string|undefined>>}) {
  const fr = (await cookies()).get("shikimomo-language")?.value === "fr";
  const t = (en: string, french: string) => fr ? french : en;
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/seller/direct");
  const {data, error} = await supabase.rpc("my_marketplace_drafts");
  const params = await searchParams;
  const drafts: MarketplaceDraft[] = !error && Array.isArray(data) ? data : [];
  return <main className="hybrid-shell" translate="no" lang={fr ? "fr" : "en"}>
    <SellingMethodTabs direct/>
    <Link href="/account/seller">← {t("Selling options", "Options de vente")}</Link>
    <h1>{t("My direct sales", "Mes ventes directes")}</h1>
    <p className="hybrid-notice">{t("Add your clothing and send it to our team for content review. Listings remain private during setup. Purchases and payouts are not open yet. You keep the item until a future confirmed sale.", "Ajoutez vos vêtements et envoyez-les à notre équipe pour révision du contenu. Les annonces restent privées pendant la mise en place. Les achats et versements ne sont pas encore ouverts. Vous gardez l’article jusqu’à une future vente confirmée.")}</p>
    <p><Link href="/account/marketplace#trade-profile">{t("Set up my seller profile", "Configurer mon profil vendeur")}</Link></p>
    {params.saved && <p role="status" className="hybrid-success">{t("Private draft saved.", "Brouillon privé enregistré.")}</p>}
    {params.updated && <p role="status" className="hybrid-success">{t("Listing updated.","Annonce mise à jour.")}</p>}
    {params.error && <p role="alert" className="hybrid-error">{params.error === "price" ? t("Enter a CAD price with at most two decimal places.", "Entrez un prix en CAD avec au plus deux décimales.") : t("The draft could not be saved. Check the fields. If this page was open in another tab, refresh before retrying.", "Le brouillon n’a pas pu être enregistré. Vérifiez les champs. Si cette page était ouverte dans un autre onglet, actualisez-la avant de réessayer.")}</p>}
    {error ? <p role="alert">{t("Direct drafts are not available in this environment yet. No changes were saved.", "Les brouillons directs ne sont pas encore disponibles dans cet environnement. Aucune modification n’a été enregistrée.")}</p> : <DirectDraftList fr={fr} drafts={drafts} save={saveDirectDraft} manage={manageDirectDraft} page={Number(params.page??1)}/>}
  </main>;
}
