import { publicPageMetadata } from "@/lib/seo";
export { default } from "../storefront";
export const dynamic = "force-dynamic";

export function generateMetadata() {
  return publicPageMetadata("/shop", {
    title: "Secondhand Shopping in Montréal | Shikimomo",
    description: "Shop secondhand finds with Shikimomo in Montréal. Browse available items, compare condition and prices, and check delivery details before buying.",
  }, {
    title: "Boutique d’occasion à Montréal | Shikimomo",
    description: "Découvrez les articles d’occasion de Shikimomo à Montréal. Consultez leur état, leur prix et les conditions de livraison avant votre achat.",
  });
}
