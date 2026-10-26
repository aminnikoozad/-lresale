import type { SellingRules } from "@/lib/business-rules";
import { formatCadFromCents, tierPriceLabel } from "@/lib/business-rules";
import type { LaunchSellerOffer } from "@/lib/launch-offer";
import type { PilotSettings } from "@/lib/pilot-settings";
import { activePilotCategories } from "@/lib/pilot-settings";
import { translate } from "@/lib/translations";

type PersonalFees = { commissionBps: number; minimumCommissionCents: number } | null;

export function SellerGuideTables({ rules, launchOffer, pilot, personalFees, fr = false }: {
  rules: SellingRules; launchOffer: LaunchSellerOffer; pilot: PilotSettings; personalFees: PersonalFees; fr?: boolean;
}) {
  const t = (en: string, french: string) => fr ? french : en;
  const money = (cents: number) => formatCadFromCents(cents);
  const categories = activePilotCategories(pilot).map(entry => translate(fr ? "fr" : "en", entry.label)).join(", ");
  // Acceptance copy adapted from Sellpy’s packing/condition guidance and KOOP’s FAQ.
  // https://intercom.help/sellpy/en/articles/408057-what-can-sellpy-help-me-sell
  // https://intercom.help/sellpy/en/articles/408067-what-do-we-not-sell-at-sellpy
  // https://ilovekoop.com/pages/faq
  // Categories, thresholds and every fee below remain Shikimomo’s own live rules.
  const acceptance = [
    [t("Clothing types", "Types de vêtements"), t("Tops, shirts, dresses, jeans, trousers, skirts, knitwear, jackets, coats and activewear.", "Hauts, chemises, robes, jeans, pantalons, jupes, tricots, vestes, manteaux et vêtements de sport."), t("Items outside the currently accepted categories.", "Articles hors des catégories actuellement acceptées.")],
    [t("Cleanliness", "Propreté"), t("Washed or cleaned as the care label allows; fully dry and ready to wear.", "Lavés ou nettoyés selon l’étiquette d’entretien; bien secs et prêts à porter."), t("Stains, dirt, sweat marks or damp fabric.", "Taches, saleté, traces de transpiration ou tissu humide.")],
    [t("Fabric & condition", "Tissu et état"), t("New or gently worn; fabric keeps its shape and colour.", "Neufs ou peu portés; tissu conservant sa forme et sa couleur."), t("Holes, tears, heavy pilling, pulled threads, pronounced fading or stretched fabric.", "Trous, déchirures, boulochage important, fils tirés, décoloration marquée ou tissu déformé.")],
    [t("Fastenings & seams", "Fermetures et coutures"), t("Working zippers, secure seams and all necessary buttons and parts.", "Fermetures fonctionnelles, coutures solides, boutons et pièces nécessaires présents."), t("Broken zippers, missing parts, open seams or visibly uneven repairs.", "Fermetures cassées, pièces manquantes, coutures ouvertes ou réparations visiblement irrégulières.")],
    [t("Odour & hygiene", "Odeur et hygiène"), t("Fresh, hygienic clothing with no signs of pests.", "Vêtements frais et propres, sans traces de parasites."), t("Smoke or mould odour, pests or contamination.", "Odeur de fumée ou de moisissure, parasites ou contamination.")],
    [t("Swimwear & underwear", "Maillots et sous-vêtements"), t("Swimwear in excellent, clean condition. Underwear only if new with original tags or packaging.", "Maillots propres en excellent état. Sous-vêtements uniquement neufs avec étiquettes ou emballage d’origine."), t("Used underwear; swimwear with hygiene issues or visible defects.", "Sous-vêtements portés; maillots présentant un problème d’hygiène ou des défauts visibles.")],
    [t("Brand & authenticity", "Marque et authenticité"), t("Genuine items; unbranded clothing may qualify if quality and resale value are sufficient.", "Articles authentiques; les vêtements sans marque peuvent être admissibles selon leur qualité et leur valeur de revente."), t("Counterfeits, misleading brand claims or items you are not authorized to sell.", "Contrefaçons, fausses indications de marque ou articles que vous n’êtes pas autorisé à vendre.")],
    [t("Resale value", "Valeur de revente"), t(`Likely individual resale value of ${money(rules.minimumIndividualItemValueCents)} or more.`, `Valeur de revente individuelle probable d’au moins ${money(rules.minimumIndividualItemValueCents)}.`), rules.bundleEligibility ? t("Lower-value pieces unless they can form a suitable bundle.", "Articles de moindre valeur, sauf s’ils peuvent former un lot approprié.") : t("Items below the minimum resale value.", "Articles sous la valeur de revente minimale.")],
  ];
  const fees = [
    [t("Batch service", "Service du lot"), money(rules.pickupRules.processingFeeCents), t("Once per new collection; not per item.", "Une fois par nouvelle collecte; pas par article.")],
    [t("Shikimomo Bag / own packaging", "Sac Shikimomo / votre emballage"), t("No extra charge", "Sans supplément"), t(`Shikimomo Bag included on request from ${money(rules.pickupRules.bagMinimumEstimatedValueCents)} estimated batch value.`, `Sac Shikimomo compris sur demande dès ${money(rules.pickupRules.bagMinimumEstimatedValueCents)} de valeur estimée du lot.`)],
    [t("Pickup below threshold", "Collecte sous le seuil"), money(rules.pickupRules.lowValuePickupItemFeeCents), t(`One flat fee per pickup below ${money(rules.pickupRules.freePickupThresholdCents)} estimated value.`, `Un seul montant par collecte sous ${money(rules.pickupRules.freePickupThresholdCents)} de valeur estimée.`)],
    [t("Pickup at / above threshold", "Collecte au seuil ou au-dessus"), money(0), t(`From ${money(rules.pickupRules.freePickupThresholdCents)} estimated value; batch service fee still applies.`, `Dès ${money(rules.pickupRules.freePickupThresholdCents)} de valeur estimée; frais de service du lot en sus.`)],
    [t("First / second missed pickup", "Première / deuxième collecte manquée"), `${money(rules.pickupRules.firstMissedPickupFeeCents)} / ${money(rules.pickupRules.secondMissedPickupFeeCents)}`, t(`Free pickup may be suspended after ${rules.pickupRules.suspendFreePickupAfterMisses} confirmed no-shows.`, `La collecte gratuite peut être suspendue après ${rules.pickupRules.suspendFreePickupAfterMisses} absences confirmées.`)],
  ];
  const validPersonalFees = personalFees && Number.isInteger(personalFees.commissionBps) && personalFees.commissionBps >= 0 && personalFees.commissionBps <= 10000 && Number.isInteger(personalFees.minimumCommissionCents) && personalFees.minimumCommissionCents >= 0;

  return <div className="seller-guide-tables" translate="no">
    <section className="guide-section" id="acceptance">
      <div className="guide-heading"><p className="eyebrow dark">{t("What we accept", "Articles acceptés")}</p><h2>{t("Check your clothes before packing.", "Vérifiez vos vêtements avant de préparer votre lot.")}</h2><p>{t("Currently accepted categories:", "Catégories actuellement acceptées :")} {categories}.</p></div>
      <div className="guide-table-frame"><table className="guide-summary-table acceptance-summary">
        <caption className="sr-only">{t("Clothing acceptance and rejection criteria", "Critères d’acceptation et de refus des vêtements")}</caption>
        <thead><tr><th scope="col">{t("Check", "Critère")}</th><th scope="col">{t("Good to send", "À envoyer")}</th><th scope="col">{t("Do not send", "À ne pas envoyer")}</th></tr></thead>
        <tbody>{acceptance.map(([label, yes, no]) => <tr key={label}><th scope="row">{label}</th><td>{yes}</td><td>{no}</td></tr>)}</tbody>
      </table></div>
      <p className="guide-note">{t(`Collection minimum: ${money(rules.minimumPickupEstimatedValueCents)} estimated total. Final acceptance follows physical inspection.`, `Minimum pour une collecte : ${money(rules.minimumPickupEstimatedValueCents)} de valeur totale estimée. L’acceptation définitive suit l’inspection physique.`)}</p>
    </section>

    <section className="guide-section guide-fee-summary" id="fees">
      <div className="guide-heading"><p className="eyebrow dark">{t("Fees at a glance", "Les frais en bref")}</p><h2>{t("Your selling costs, clearly.", "Vos frais de vente, clairement.")}</h2><p>{t("All amounts in CAD. Pickup is available in Montréal and surrounding areas.", "Tous les montants sont en CAD. Collecte offerte à Montréal et dans les environs.")}</p></div>
      <div className="guide-table-frame"><table className="guide-summary-table fee-summary">
        <caption className="sr-only">{t("Managed and personal selling fees, kept separate", "Frais distincts de dépôt-vente géré et de vente personnelle")}</caption>
        <thead><tr><th scope="col">{t("Fee", "Frais")}</th><th scope="col">{t("Amount / rate", "Montant / taux")}</th><th scope="col">{t("When it applies", "Application")}</th></tr></thead>
        <tbody>
          <tr className="guide-table-group"><th colSpan={3} scope="rowgroup">{t("We sell for you · managed selling", "Nous vendons pour vous · dépôt-vente géré")}</th></tr>
          {fees.map(([label, amount, when]) => <tr key={label}><th scope="row">{label}</th><td>{amount}</td><td>{when}</td></tr>)}
          {launchOffer.active ? <tr id="launch-offer"><th scope="row">{t("Launch offer", "Offre de lancement")}</th><td>{t("Batch service fee waived", "Frais de service du lot exonérés")}</td><td>{t(`First ${launchOffer.maxClaims} eligible sellers, first submitted collection only; ${launchOffer.remaining} spots left. Pickup fee is not waived.`, `${launchOffer.maxClaims} premiers vendeurs admissibles, première demande de collecte envoyée uniquement; ${launchOffer.remaining} places restantes. Frais de transport non exonérés.`)}</td></tr> : null}
          {rules.commissionTiers.map(tier => <tr key={tier.minCents}><th scope="row">{t("Selling commission", "Commission de vente")} · {tierPriceLabel(tier)}</th><td>{tier.platformBps / 100}%</td><td>{t(`You keep ${tier.sellerBps / 100}%. Tier fixed by the first approved price.`, `Vous conservez ${tier.sellerBps / 100} %. Tranche fixée selon le premier prix approuvé.`)}</td></tr>)}
          <tr className="guide-table-group"><th colSpan={3} scope="rowgroup">{t("You list and sell · personal selling", "Vous publiez et vendez · vente personnelle")}</th></tr>
          <tr><th scope="row">{t("Personal-selling commission", "Commission de vente personnelle")}</th><td>{validPersonalFees ? t(`${personalFees.commissionBps / 100}%, minimum ${money(personalFees.minimumCommissionCents)}`, `${personalFees.commissionBps / 100} %, minimum ${money(personalFees.minimumCommissionCents)}`) : t("Fees temporarily unavailable", "Frais temporairement indisponibles")}</td><td>{t("Once per seller order, on discounted items only; excludes shipping and tax. The minimum is not an extra fee.", "Une fois par commande de chaque vendeur, sur les articles après réduction; hors livraison et taxes. Le minimum ne s’ajoute pas à la commission.")}</td></tr>
        </tbody>
      </table></div>
      <p className="guide-note">{t("Managed and personal sales use separate rates. Commission is not charged again at cash-out.", "Les ventes gérées et personnelles ont des taux distincts. La commission n’est pas facturée une deuxième fois au retrait.")}</p>
    </section>
  </div>;
}
