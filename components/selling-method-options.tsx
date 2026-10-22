import Link from "next/link";
import type { ReactNode } from "react";
export function SellingMethodOptions({fr=false,directHref="/account/seller/direct",managedControls}:{fr?:boolean;directHref?:string;managedControls:ReactNode}) {
  const t=(en:string,french:string)=>fr?french:en;
  return <section className="selling-method-options" aria-label={t("Choose how to sell","Choisissez comment vendre")} translate="no" lang={fr?"fr":"en"}>
    <article><span>{t("Managed service","Service géré")}</span><h2>{t("Let Shikimomo handle it","Shikimomo s’en occupe")}</h2><p>{t("Request a Bag or pickup. Our team receives, inspects, photographs, prices and ships accepted items under the managed-service terms.","Demandez un sac ou une collecte. Notre équipe reçoit, inspecte, photographie, évalue et expédie les articles acceptés selon les conditions du service géré.")}</p>{managedControls}</article>
    <article><span>{t("Direct selling","Vente directe")}</span><h2>{t("Sell it myself","Je vends moi-même")}</h2><p>{t("Keep your clothes, add your own photos and price, and ship after a confirmed sale. No Bag or warehouse intake.","Gardez vos vêtements, ajoutez vos photos et votre prix, puis expédiez après une vente confirmée. Aucun sac ni dépôt en entrepôt.")}</p><Link href={directHref} className="hybrid-button">{t("My listings / Add clothing","Mes annonces / Ajouter un vêtement")}</Link><small>{t("Private drafts are available. Direct purchases remain closed during setup.","Les brouillons privés sont disponibles. Les achats directs restent fermés pendant la mise en place.")}</small></article>
  </section>;
}
