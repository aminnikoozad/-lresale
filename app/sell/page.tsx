import { publicPageMetadata } from "@/lib/seo";
import Link from "next/link";
import { cookies } from "next/headers";
import "./sell.css";
import { PersonalSellingFees } from "@/components/personal-selling-fees";
export function generateMetadata() {
  return publicPageMetadata("/sell", {
    title: "Sell Secondhand Clothes in Montréal | Shikimomo",
    description: "Explore selling with Shikimomo in Montréal. Learn about managed consignment, inspection, team pricing, fees and the direct-selling mode in preparation.",
  }, {
    title: "Vendre ses vêtements d’occasion à Montréal | Shikimomo",
    description: "Découvrez la vente avec Shikimomo à Montréal : dépôt-vente géré, inspection, prix et frais, ainsi que le mode de vente directe en préparation.",
  });
}
export default async function SellPage() {
  const fr = (await cookies()).get("shikimomo-language")?.value === "fr";
  return <main className="hybrid-shell" lang={fr ? "fr" : "en"} translate="no">
    <p className="hybrid-eyebrow">SHIKIMOMO</p>
    <h1>{fr ? "Vendez à votre façon." : "Sell your way."}</h1>
    <p>{fr ? "Un compte, deux façons de donner une seconde vie à vos vêtements." : "One account, two ways to give your clothes a second life."}</p>
    <div className="hybrid-options">
      <article><span>{fr ? "Vous gardez les articles" : "Keep your items at home"}</span>
        <h2>{fr ? "Je vends moi-même" : "Sell it myself"}</h2>
        <p>{fr ? "Ajoutez vos photos, vos descriptions et vos prix. Après une vente, vous emballez et expédiez vous-même." : "Add your photos, descriptions and prices. After a sale, you pack and ship the order."}</p>
        <dl><dt>{fr ? "Prix" : "Pricing"}</dt><dd>{fr ? "Vous choisissez" : "You choose"}</dd><dt>{fr ? "Inspection" : "Inspection"}</dt><dd>{fr ? "État déclaré par le vendeur" : "Condition declared by the seller"}</dd><dt>{fr ? "Frais" : "Fees"}</dt><dd><PersonalSellingFees fr={fr} summary/></dd></dl>
        <p className="hybrid-notice">{fr ? "Publiez votre annonce après approbation du contenu. Vos revenus et frais restent distincts du dépôt-vente. Les achats et versements attendent la connexion du paiement." : "Publish your listing after content approval. Your earnings and fees stay separate from managed selling. Purchases and payouts await payment connection."}</p>
        <Link className="hybrid-button" href="/account/seller/direct">{fr ? "Ajouter mes vêtements" : "List my clothes"}</Link>
      </article>
      <article><span>{fr ? "Vous nous confiez les articles" : "Send your items to our team"}</span>
        <h2>{fr ? "Shikimomo s’en occupe" : "Let Shikimomo handle it"}</h2>
        <p>{fr ? "Nous inspectons, photographions, fixons les prix, mettons en vente et expédions vos articles." : "We inspect, photograph, price, list and ship your items."}</p>
        <dl><dt>{fr ? "Prix" : "Pricing"}</dt><dd>{fr ? "Décision de l’équipe" : "Set by the team"}</dd><dt>{fr ? "Inspection" : "Inspection"}</dt><dd>{fr ? "Inspection physique avant publication" : "Physical inspection before publication"}</dd><dt>{fr ? "Frais et délais" : "Fees and timelines"}</dt><dd>{fr ? "Voir les détails du service" : "See service details"}</dd></dl>
        <Link className="hybrid-button" href="/sell-with-shikimomo">{fr ? "Voir le service et les frais" : "View service and fees"}</Link>
      </article>
    </div>
    <p>{fr ? "Aucune vente ni aucun revenu n’est garanti." : "Sales and earnings are not guaranteed."}</p>
    <Link href="/account/seller">{fr ? "Mon compte vendeur" : "My seller account"}</Link>
  </main>;
}
