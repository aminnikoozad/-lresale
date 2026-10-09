/** Resolve storefront links only to categories currently enabled in the catalog. */
export function hashCategory<Value extends string>(
  hash: string,
  labels: readonly { value: Value; label: string }[],
): Value | null {
  const fragment = hash.replace(/^#/, "").toLowerCase();
  const value = fragment === "shop" || fragment === "" ? "all" : fragment;
  return labels.find((entry) => entry.value === value)?.value ?? null;
}
