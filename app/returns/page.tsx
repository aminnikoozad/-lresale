import { localizedMetadata } from "@/lib/localized-metadata";

import { Localize } from "@/components/site-language";
import { BrandWordmark } from "@/components/brand-wordmark";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Returns & Refunds", description: "Return and refund policy for Shikimomo purchases." }, {"title": "Retours et remboursements", "description": "Politique de retour et de remboursement des achats Shikimomo."});
}

export default function ReturnsPage() {
  return <Localize>{<main className="shipping-policy-page"><header className="policy-header"><Link href="/" className="brand"><BrandWordmark /></Link><Link href="/account">My account</Link></header><article className="legal-policy">
    <div className="policy-hero"><p className="eyebrow dark">Buyer protection</p><h1>Returns & Refunds</h1><p>Effective October 26, 2026</p></div>
    <section lang="fr"><h2>Français</h2>
      <p>Cette version s’applique aux nouvelles commandes acceptant la politique du 26 octobre 2026. Les commandes antérieures conservent les conditions acceptées lors de l’achat.</p>
      <h3>Demande sous 7 jours après livraison</h3>
      <p>Signalez un article erroné, une différence importante avec la description, un défaut non déclaré ou un dommage de transport dans les 7 jours civils suivant la livraison, depuis votre compte acheteur ou auprès du soutien. Indiquez le problème et fournissez des photos pour permettre son examen. Une demande ne constitue pas une autorisation de retour.</p>
      <h3>Changement d’avis et erreur de sélection</h3>
      <p>Nous n’acceptons pas les retours pour changement d’avis, préférence personnelle ou taille choisie par erreur lorsque la taille, les mesures et les autres renseignements annoncés sont exacts. Une usure clairement annoncée ne constitue pas un défaut non déclaré.</p>
      <h3>Examen et retour autorisé</h3>
      <p>Nous examinons votre demande, la fiche de l’article et les renseignements de commande avant de décider. Après autorisation, expédiez le colis dans les 7 jours civils suivant nos instructions. Nous fournissons une étiquette de retour prépayée ou organisons avec vous un retour approprié. N’envoyez pas le colis à une adresse de collecte sans instructions. Conservez l’article, ses étiquettes, l’emballage et les preuves disponibles; une utilisation ou détérioration nouvelle peut influencer l’examen, sans limiter vos droits légaux.</p>
      <h3>Frais et montant remboursé</h3>
      <p>Pour un problème confirmé qui nous est attribuable, Shikimomo prend en charge les frais raisonnables de retour, sans frais de remise en stock ni déduction du coût de l’étiquette. Nous remboursons le montant réellement payé pour l’article après rabais, les taxes applicables et les frais de livraison initiaux applicables. Les rabais de commande sont répartis proportionnellement. Pour une commande entièrement concernée, la livraison initiale est remboursée; pour un retour partiel, seule la part attribuable aux articles concernés est remboursée.</p>
      <h3>Délais de remboursement et échanges</h3>
      <p>Nous inspectons les articles à leur réception et lançons un remboursement approuvé dans les 5 jours ouvrables suivant la réception et l’inspection, par le moyen de paiement initial lorsque possible. Votre banque peut nécessiter un délai supplémentaire. Tout délai légal plus court prévaut. Les articles étant généralement uniques, les échanges ne sont pas garantis.</p>
      <h3>Vos droits légaux</h3>
      <p>Le délai de signalement de 7 jours et ces conditions ne limitent pas les garanties légales, les droits d’annulation des contrats à distance ni les autres droits obligatoires au Québec. Vous pouvez signaler une réclamation légale depuis votre compte ou auprès du soutien, y compris après ce délai. Les recours, délais et frais prévus par la loi continuent de s’appliquer. La vente d’occasion ne supprime pas ces droits.</p>
      <p>Commandes antérieures : <Link href="/returns/2026-10-18">politique du 18 octobre 2026</Link>.</p>
    </section>
    <section lang="en"><h2>English</h2>
      <p>This version applies to new orders accepting the October 26, 2026 policy. Earlier orders retain the terms accepted at purchase.</p>
      <h3>Report a problem within 7 days of delivery</h3>
      <p>Report a wrong item, a material difference from the listing, an undisclosed defect or transit damage within 7 calendar days after delivery through your buyer account or Support. Describe the problem and provide photos for review. Submitting a request does not authorize a return.</p>
      <h3>Change of mind and selection errors</h3>
      <p>We do not accept returns for a change of mind, personal preference or an incorrectly selected size when the advertised size, measurements and other details are accurate. Clearly disclosed wear is not an undisclosed defect.</p>
      <h3>Review and approved returns</h3>
      <p>We review your request, the listing and order information before deciding. After approval, ship the parcel within 7 calendar days using our instructions. We provide a prepaid return label or arrange an appropriate return with you. Do not send returns to a pickup address without instructions. Keep the item, its tags, packaging and available evidence; new use or damage may affect the review without limiting your legal rights.</p>
      <h3>Return costs and refund amount</h3>
      <p>For a confirmed issue attributable to us, Shikimomo covers reasonable return shipping, with no restocking fee or return-label deduction. We refund the amount actually paid for the affected item after discounts, its applicable taxes and applicable original delivery charges. Order discounts are allocated proportionally. If the full order is affected, original delivery is refunded; for a partial return, only the delivery amount attributable to the affected items is refunded.</p>
      <h3>Refund timing and exchanges</h3>
      <p>We inspect returned items on receipt and initiate an approved refund within 5 business days after receipt and inspection, using the original payment method where possible. Your bank may need additional time. Any shorter legal deadline takes precedence. Because items are usually unique, exchanges are not guaranteed.</p>
      <h3>Your legal rights</h3>
      <p>The 7-day reporting period and these conditions do not limit legal warranties, distance-contract cancellation rights or other mandatory rights in Quebec. You can submit a statutory claim through your account or Support, including after this period. Statutory remedies, deadlines and costs continue to apply. Selling an item second-hand does not remove these rights.</p>
      <p>Earlier orders: <Link href="/returns/2026-10-18">October 18, 2026 policy</Link>.</p>
    </section>
    <section><h2>Support · Soutien</h2><p><Link href="/support">Contact &amp; support</Link></p>{siteConfig.supportEmail ? <p><a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a></p> : null}</section>
    <Link className="policy-back" href="/"><ArrowLeft/> Back to Shikimomo</Link>
  </article></main>}</Localize>;
}
