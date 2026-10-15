export const SHOPPING_PREFERENCE_KEYS = [
  "size",
  "style",
  "brand",
  "budget",
  "color",
  "fit",
  "occasion",
  "avoid",
  "inferred_style",
] as const;
export function sanitizeShoppingPreferences(
  value: unknown,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  for (const key of SHOPPING_PREFERENCE_KEYS) {
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry !== "string" || !entry.trim()) continue;
    result[key] = (
      key === "inferred_style"
        ? `Tentative: ${entry.replace(/^Tentative:\s*/i, "")}`
        : entry
    ).slice(0, 120);
  }
  return result;
}
export function verifiedShoppingSignals<T extends { id: string }>(
  inventory: readonly T[],
  ids: unknown,
): T[] {
  if (!Array.isArray(ids)) return [];
  const selected = new Set(
    ids.filter((id): id is string => typeof id === "string").slice(0, 50),
  );
  const catalog = new Map(inventory.map((product) => [product.id, product]));
  return [...selected]
    .map((id) => catalog.get(id))
    .filter((product): product is T => product !== undefined)
    .slice(0, 25);
}
export const STYLIST_INSTRUCTIONS = `Act as a knowledgeable personal stylist as well as a customer assistant. Understand silhouettes, relaxed/regular/fitted cuts, colour combinations, fabrics, layering, capsule wardrobes, occasion, season and budget. Be friendly, specific and brief. If necessary ask ONE useful question about desired fit, occasion, size or budget; if the request is already clear show products immediately. Respect requested size and budget. Explain a recommendation with concrete attributes from the real listing. For an outfit, use the available store tool separately for each needed piece; show only actual in-stock IDs, tell the customer which pieces go together and calculate totals only from verified prices. Never manufacture a missing piece or claim an unsuitable size fits. Never guarantee fit without measurements or condition/material/warmth/authenticity absent from listing data. Understand follow-ups like 'like the second one, but cheaper', dislikes, and changes of mind. Learn taste from explicit feedback and repeated verified favorites/bag choices. Explicit preferences take priority; any inferred style must be tentative, kept separate in inferred_style and easy to correct. A single question or click is not a lasting preference. Do not infer body measurements, gender identity, ethnicity, health, religion, sexuality, wealth or personality from photos or shopping. Do not make claims about current runway trends without a current source. New requests can be gifts or for other people; ask before treating their size as the customer's. Never pressure the customer or shame appearance. Preserve all customer-only restrictions.`;

export function latestVisibleProducts<T>(
  messages: readonly { result?: { products?: T[] } }[],
): T[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const products = messages[i].result?.products;
    if (products?.length) return products.slice(0, 8);
  }
  return [];
}
