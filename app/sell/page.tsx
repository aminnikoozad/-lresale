import Link from "next/link";
import { cookies } from "next/headers";
import "./sell.css";
export const metadata = {title: "Sell | SHIKIMOMO"};
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
        <dl><dt>{fr ? "Prix" : "Pricing"}</dt><dd>{fr ? "Vous choisissez" : "You choose"}</dd><dt>{fr ? "Inspection" : "Inspection"}</dt><dd>{fr ? "État déclaré par le vendeur" : "Condition declared by the seller"}</dd><dt>{fr ? "Frais" : "Fees"}</dt><dd>{fr ? "Tarif en cours de validation" : "Fee policy under review"}</dd></dl>
        <p className="hybrid-notice">{fr ? "En préparation : les brouillons sont privés. La publication, l’achat et les versements ne sont pas encore disponibles." : "In preparation: drafts are private. Publishing, purchasing and payouts are not available yet."}</p>
        <Link className="hybrid-button" href="/account/seller/direct">{fr ? "Préparer un brouillon" : "Prepare a draft"}</Link>
      </article>
      <article><span>{fr ? "Vous nous confiez les articles" : "Send your items to our team"}</span>
        <h2>{fr ? "Shikimomo s’en occupe" : "Let Shikimomo handle it"}</h2>
        <p>{fr ? "Confiez vos articles à notre équipe pour l’inspection, les photos, les prix, la mise en vente et l’expédition, selon les conditions du service." : "Our team handles inspection, photography, pricing, listing and shipping under the managed service terms."}</p>
        <dl><dt>{fr ? "Prix" : "Pricing"}</dt><dd>{fr ? "Décision de l’équipe" : "Set by the team"}</dd><dt>{fr ? "Inspection" : "Inspection"}</dt><dd>{fr ? "Inspection physique avant publication" : "Physical inspection before publication"}</dd><dt>{fr ? "Frais et délais" : "Fees and timelines"}</dt><dd>{fr ? "Selon les conditions actuelles du service" : "Under the current service terms"}</dd></dl>
        <Link className="hybrid-button" href="/sell-with-shikimomo">{fr ? "Voir le service et les frais" : "View service and fees"}</Link>
      </article>
    </div>
    <p>{fr ? "Aucune vente ni aucun revenu n’est garanti." : "Sales and earnings are not guaranteed."}</p>
    <Link href="/account/seller">{fr ? "Mon compte vendeur" : "My seller account"}</Link>
  </main>;
}
