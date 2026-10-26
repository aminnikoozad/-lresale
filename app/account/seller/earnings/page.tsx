import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { type SellerBalances } from "@/lib/seller-ledger";
import { createClient } from "@/lib/supabase/server";
import { PersonalSellingFees } from "@/components/personal-selling-fees";

function cad(cents:number) { return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(cents/100); }
export default async function SellerEarnings() {
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/seller/earnings");
  const [summary,activity] = await Promise.all([
    supabase.rpc("my_seller_balances"),
    supabase.from("wallet_transactions").select("id,amount_cents,status,transaction_type,description,created_at,sale_mode").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50),
  ]);
  const balances = summary.data as SellerBalances|null;
  const fr = (await cookies()).get("shikimomo-language")?.value === "fr";
  const t = (en:string,french:string) => fr?french:en;
  return <main className="account-shared-page" translate="no" lang={fr?"fr":"en"}>
    <p className="eyebrow dark">{t("Seller account","Compte vendeur")}</p><h1>{t("Earnings & payouts","Revenus et versements")}</h1>
    <p><Link href="/account/seller/statements">{t("My sales statements →","Mes relevés de vente →")}</Link></p>
    {summary.error||activity.error||!balances ? <p role="alert">{t("Your earnings could not be loaded. Please try again.","Impossible de charger vos revenus. Réessayez.")}</p> : <>
      <p>{t("Each selling method has its own balance and commission record. Earnings from one method cannot cover a withdrawal from the other.","Chaque méthode possède son propre solde et son historique de commission. Les revenus d’une méthode ne peuvent pas financer un retrait de l’autre.")}</p>
      {(["managed_consignment","peer_to_peer"] as const).map(mode=><section className="account-shared-card" key={mode}>
        <h2>{mode==="managed_consignment"?t("Sold by Shikimomo","Vendu par Shikimomo"):t("My personal sales","Mes ventes personnelles")}</h2>
        <dl><dt>{t("Pending earnings","Revenus en attente")}</dt><dd>{cad(balances[mode].pending)}</dd><dt>{t("Confirmed balance","Solde confirmé")}</dt><dd>{cad(balances[mode].confirmed)}</dd></dl>
        {mode==="managed_consignment"?<p>{t("The percentage agreed for each item is preserved. Collection and service fees apply only to this managed balance.","Le pourcentage convenu pour chaque article est conservé. Les frais de collecte et de service concernent uniquement ce solde géré.")}</p>:<PersonalSellingFees fr={fr}/>}
        <p>{t("Commission is recorded with the sale, not recalculated at cash-out. Online bank withdrawals are not available until a payout provider is connected.","La commission est enregistrée lors de la vente, sans nouveau calcul au retrait. Les retraits bancaires en ligne seront disponibles après la connexion d’un prestataire de versement.")}</p>
        <Link href={`/account/messages?topic=${mode}`}>{t("Contact Support about this balance →","Contacter le soutien pour ce solde →")}</Link>
        <h3>{t("Activity for this selling method","Activité de cette méthode")}</h3>
        {activity.data?.filter(row=>row.sale_mode===mode).length?<ul>{activity.data.filter(row=>row.sale_mode===mode).map(row=><li key={row.id}>{new Date(row.created_at).toLocaleDateString(fr?"fr-CA":"en-CA",{timeZone:"America/Toronto"})} · {row.description||row.transaction_type} · {cad(row.amount_cents)} · {row.status}</li>)}</ul>:<p>{t("No earnings activity yet.","Aucune activité pour le moment.")}</p>}
      </section>)}
      {balances.unallocated>0&&<p role="status">{t("Some older entries need a selling-method review. They are excluded from both balances.","Certaines anciennes écritures nécessitent une vérification de leur méthode. Elles sont exclues des deux soldes.")}</p>}
    </>}
    <Link href="/account/seller">{t("Back to selling dashboard","Retour au tableau de vente")}</Link>
  </main>;
}
