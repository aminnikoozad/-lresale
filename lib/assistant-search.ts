export type SearchableProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  size: string | null;
  color?: string | null;
  priceCents: number;
  subcategory?: string | null;
  material?: string | null;
  pattern?: string | null;
  condition?: string | null;
};
export type InventoryQuery = {
  query?: string;
  category?: string;
  size?: string;
  color?: string;
  brand?: string;
  max_price_cents?: number;
  material?: string;
  pattern?: string;
  condition?: string;
};
function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/t[- ]?shirts?|tees?|chandails?/g, "tshirt")
    .replace(/\bsmall\b/g, "s")
    .replace(/\bmedium\b/g, "m")
    .replace(/\blarge\b/g, "l")
    .replace(/\bnoir\w*\b/g, "black")
    .replace(/\bblanc\w*\b/g, "white")
    .replace(/\bbleu\w*\b/g, "blue")
    .replace(/\brouge\w*\b/g, "red")
    .trim();
}
export function searchAssistantInventory<T extends SearchableProduct>(
  products: readonly T[],
  input: InventoryQuery,
) {
  const query = normalize(input.query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12);
  const ranked = products
    .map((p) => {
      const differences: string[] = [];
      const hay = normalize(
        `${p.name} ${p.brand} ${p.subcategory || ""} ${p.material || ""} ${p.pattern || ""}`,
      );
      let score = 0;
      for (const field of [
        "category",
        "size",
        "color",
        "brand",
        "material",
        "pattern",
        "condition",
      ] as const) {
        if (!input[field]) continue;
        if (normalize(p[field]) === normalize(input[field]))
          score += field === "category" ? 12 : 8;
        else differences.push(field);
      }
      if (query.length) {
        const count = query.filter((term) => hay.includes(term)).length;
        score += count * 5;
        if (count !== query.length) differences.push("description");
      }
      if (
        typeof input.max_price_cents === "number" &&
        p.priceCents > input.max_price_cents
      )
        differences.push("budget");
      return { product: p, differences, score };
    })
    .sort(
      (a, b) =>
        a.differences.length - b.differences.length ||
        b.score - a.score ||
        a.product.priceCents - b.product.priceCents,
    );
  const exact = ranked.filter((r) => !r.differences.length).slice(0, 8);
  // Alternatives never masquerade as exact matches and do not cross departments.
  const alternatives = exact.length
    ? []
    : ranked
        .filter(
          (r) =>
            (!input.category ||
              normalize(r.product.category) === normalize(input.category)) &&
            r.score > 0,
        )
        .slice(0, 6);
  return { exact, alternatives };
}
