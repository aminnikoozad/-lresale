import { homeCollectionMatches, type HomeData } from "./home-decor";
import { priceCents, type CatalogFilters } from "./catalog-navigation";

/** Public listing fields used by the storefront; no database or React dependencies. */
export type FilterableCatalogProduct = {
  name: string;
  brand: string;
  priceCents: number;
  category: string;
  subcategory: string | null;
  condition: string | null;
  size: string | null;
  color: string | null;
  material: string | null;
  pattern: string | null;
  publishedAt: string | null;
  home?: HomeData;
  priceDrop?: boolean;
};

export function filterCatalogProducts<T extends FilterableCatalogProduct>(
  products: readonly T[],
  filters: CatalogFilters,
  now: number,
): T[] {
  const { category, query, subcategories, eras, homeFlags, collection, brands, sizes, conditions, colors, materials, patterns, sort } = filters;
  const minCents = priceCents(filters.minPrice);
  const maxCents = priceCents(filters.maxPrice);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const next = products.filter((product) => {
    const haystack =
      `${product.name} ${product.brand} ${product.category} ${product.subcategory || ""} ${product.size || ""} ${product.color || ""} ${product.material || ""} ${product.pattern || ""} ${product.home?.designer || ""} ${product.home?.era || ""} ${product.home?.keywords || ""}`.toLowerCase();
    return (
      (category === "all" || product.category === category) &&
      (!subcategories.length ||
        (product.subcategory && subcategories.includes(product.subcategory))) &&
      (!eras.length || eras.includes(String(product.home?.era))) &&
      homeFlags.every((f) =>
        f === "price_drop"
          ? product.priceDrop
          : f === "new_arrivals"
            ? homeCollectionMatches(
                "Recently Added",
                product.home ?? {},
                product.priceCents,
                product.publishedAt,
                now,
              )
            : product.home?.[f] === true,
      ) &&
      (!collection ||
        (collection === "clothing-new" ? clothingCollectionMatches(product, collection, now)
        : collection === "clothing-under-25" ? clothingCollectionMatches(product, collection, now)
        : product.home &&
          homeCollectionMatches(
            collection,
            product.home,
            product.priceCents,
            product.publishedAt,
            now,
          ))) &&
      terms.every(term => haystack.split(/[^\p{L}\p{N}-]+/u).some(word => term.length <= 2 ? word === term : word.includes(term))) &&
      (!brands.length || brands.includes(product.brand)) &&
      (!sizes.length || (product.size && sizes.includes(product.size))) &&
      (!conditions.length ||
        (product.condition && conditions.includes(product.condition))) &&
      (!colors.length || (product.color && colors.includes(product.color))) &&
      (!materials.length ||
        (product.material && materials.includes(product.material))) &&
      (!patterns.length ||
        (product.pattern && patterns.includes(product.pattern))) &&
      (minCents == null || product.priceCents >= minCents) &&
      (maxCents == null || product.priceCents <= maxCents)
    );
  });
  return [...next].sort((a, b) => {
    if (sort === "price_low") return a.priceCents - b.priceCents;
    if (sort === "price_high") return b.priceCents - a.priceCents;
    if (sort === "brand")
      return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
    return (
      new Date(b.publishedAt || 0).getTime() -
      new Date(a.publishedAt || 0).getTime()
    );
  });
}

export function clothingCollectionMatches(product: FilterableCatalogProduct, collection: string, now: number): boolean {
  if (!["women", "men", "kids"].includes(product.category)) return false;
  if (collection === "clothing-under-25") return product.priceCents < 2500;
  const published = Date.parse(product.publishedAt || "");
  return collection === "clothing-new" && Number.isFinite(published) && published <= now && published >= now - 30 * 86400000;
}
