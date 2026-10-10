/** Resolve storefront links only to categories currently enabled in the catalog. */
export function hashCategory<Value extends string>(
  hash: string,
  labels: readonly { value: Value; label: string }[],
): Value | null {
  const fragment = hash.replace(/^#/, "").toLowerCase();
  const value = fragment === "shop" || fragment === "" ? "all" : fragment;
  return labels.find((entry) => entry.value === value)?.value ?? null;
}

export type CatalogSort = "newest" | "price_low" | "price_high" | "brand";
export const catalogListFields = ["subcategories", "eras", "homeFlags", "brands", "sizes", "conditions", "colors", "materials", "patterns"] as const;
export type CatalogFilters = Record<typeof catalogListFields[number], string[]> & {
  category: string;
  query: string;
  collection: string;
  minPrice: string;
  maxPrice: string;
  sort: CatalogSort;
};
export function emptyCatalogFilters(category = "all", query = ""): CatalogFilters {
  return { category, query, collection: "", minPrice: "", maxPrice: "", sort: "newest", subcategories: [], eras: [], homeFlags: [], brands: [], sizes: [], conditions: [], colors: [], materials: [], patterns: [] };
}
export function priceCents(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}
/** Category links drop incompatible facets; history entries restore the whole selection. */
export function readCatalogLocation(search: string, hash: string, labels: readonly { value: string; label: string }[]): CatalogFilters {
  const params = new URLSearchParams(search);
  const savedCategory = labels.find((entry) => entry.value === params.get("catalog"))?.value;
  const category = (hash ? hashCategory(hash, labels) : savedCategory) ?? savedCategory ?? "all";
  const state = emptyCatalogFilters(category, params.get("q") ?? "");
  if (params.has("catalog") && params.get("catalog") !== category) return state;
  for (const key of catalogListFields) state[key] = [...new Set(params.getAll(key).filter(Boolean))];
  state.collection = params.get("collection") ?? "";
  for (const key of ["minPrice", "maxPrice"] as const) {
    const raw = params.get(key) ?? "";
    state[key] = priceCents(raw) === null ? "" : raw;
  }
  const sort = params.get("sort");
  if (sort === "price_low" || sort === "price_high" || sort === "brand") state.sort = sort;
  return state;
}
/** Preserve unrelated URL parameters while keeping catalog links shareable. */
export function catalogLocation(pathname: string, search: string, state: CatalogFilters): string {
  const params = new URLSearchParams(search);
  for (const key of [...catalogListFields, "q", "catalog", "collection", "minPrice", "maxPrice", "sort"]) params.delete(key);
  params.set("catalog", state.category);
  if (state.query.trim()) params.set("q", state.query);
  for (const key of catalogListFields) for (const value of state[key]) params.append(key, value);
  for (const key of ["collection", "minPrice", "maxPrice"] as const) if (state[key]) params.set(key, state[key]);
  if (state.sort !== "newest") params.set("sort", state.sort);
  return `${pathname}?${params.toString()}#${state.category === "all" ? "shop" : state.category}`;
}

/** Text edits update the current address; discrete choices remain Back/Forward steps. */
export function catalogHistoryMode(previous: CatalogFilters, next: CatalogFilters): "push" | "replace" {
  const discreteFields = [...catalogListFields, "category", "collection", "sort"] as const;
  return discreteFields.some((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key])) ? "push" : "replace";
}
