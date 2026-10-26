export type SeoProduct = {
  item_id: string;
  name: string;
  brand: string;
  size: string | null;
  item_condition: string | null;
  description: string | null;
  photo_urls: string[];
  price_cents: number;
  availability?: "available" | "reserved" | "sold";
  checkout_enabled?:boolean;
};

export const isItemId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function productSeo(product: SeoProduct, origin: string, french = false) {
  const url = new URL(`/item/${product.item_id}`, origin).href;
  const details = [product.name, product.brand, product.size, product.item_condition].filter(Boolean).join(" · ");
  const description = (product.description?.trim() || details).replace(/\s+/g, " ").slice(0, 160);
  const title = `${product.name} | Shikimomo`;
  const validPrice = Number.isSafeInteger(product.price_cents) && product.price_cents > 0;
  const availability = product.availability === "sold" ? "https://schema.org/SoldOut"
    : product.availability === "reserved" ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock";
  return {
    url, title, description,
    metadata: {
      title: { absolute: title }, description,
      alternates: { canonical: url },
      openGraph: { type: "website" as const, siteName: "Shikimomo", url, title, description, images: product.photo_urls, locale: french ? "fr_CA" : "en_CA" },
      twitter: { card: "summary_large_image" as const, title, description, images: product.photo_urls },
    },
    structuredData: {
      "@context": "https://schema.org", "@type": "Product", "@id": `${url}#product`,
      name: product.name, description, image: product.photo_urls, url, sku: product.item_id,
      ...(product.brand && !["unbranded", "no brand", "other"].includes(product.brand.toLowerCase())
        ? { brand: { "@type": "Brand", name: product.brand } } : {}),
      ...(product.size ? { size: product.size } : {}),
      ...(validPrice && product.checkout_enabled!==false ? { offers: {
        "@type": "Offer", url, priceCurrency: "CAD", price: (product.price_cents / 100).toFixed(2), availability,
        itemCondition: product.item_condition === "New" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
      } } : {}),
    },
  };
}

/** Safe for embedding user-authored product text in a JSON-LD script. */
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
