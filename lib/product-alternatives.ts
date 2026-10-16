export type Alternative = { id: string; category: string; size: string | null; subcategory: string | null; priceCents: number };
/** Candidates must come from the current available catalog, never a recommendation cache. */
export function productAlternatives<T extends Alternative>(current: Alternative, available: readonly T[], limit = 4): T[] {
 return available.filter(p => p.id !== current.id && p.category === current.category).sort((a,b) =>
   Number(b.size === current.size && Boolean(current.size)) - Number(a.size === current.size && Boolean(current.size)) ||
   Number(b.subcategory === current.subcategory && Boolean(current.subcategory)) - Number(a.subcategory === current.subcategory && Boolean(current.subcategory)) ||
   Math.abs(a.priceCents-current.priceCents)-Math.abs(b.priceCents-current.priceCents) || a.id.localeCompare(b.id)
 ).slice(0,limit);
}
