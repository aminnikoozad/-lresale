export type SaleMode = "managed_consignment" | "peer_to_peer";
export type MarketplaceFeePolicy = {
  version: number; commissionBps: number; minimumCommissionCents: number;
};
// Intentionally not an active commercial policy. Callers must pass a reviewed policy.
export function marketplaceCommission(itemNetCents: number, policy: MarketplaceFeePolicy) {
  if (!Number.isSafeInteger(itemNetCents) || itemNetCents < 0 || itemNetCents > 100000000 ||
      !Number.isSafeInteger(policy.version) || policy.version < 1 ||
      !Number.isSafeInteger(policy.commissionBps) || policy.commissionBps < 0 || policy.commissionBps > 10000 ||
      !Number.isSafeInteger(policy.minimumCommissionCents) || policy.minimumCommissionCents < 0 || policy.minimumCommissionCents > 100000000) {
    throw new Error("Invalid cents or fee policy");
  }
  const proportional = Math.floor((itemNetCents * policy.commissionBps + 5000) / 10000);
  const commissionCents = Math.min(itemNetCents, Math.max(proportional, policy.minimumCommissionCents));
  return { commissionCents, sellerNetCents: itemNetCents - commissionCents, policyVersion: policy.version };
}
export function parseCadCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(normalized)) throw new Error("Invalid CAD amount");
  const [dollars, decimals = ""] = normalized.split(".");
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, "0"));
  if (cents < 1 || cents > 100000000) throw new Error("Invalid CAD amount");
  return cents;
}
export type MarketplaceDraft = {
  id: string; name: string; category: string; brand: string | null; subcategory: string | null;
  size: string | null; item_condition: string | null; color: string | null; material: string | null;
  description: string | null; condition_notes: string | null; listed_price_cents: number | null;
  marketplace_details: {brandKind?: string; sizeSystem?: string; labelAbsent?: boolean};
  listing_version: number; status: string; updated_at: string;
};
