export type Parcel = { itemId: string; weightGrams: number; lengthMm: number; widthMm: number; heightMm: number; mailingTube: boolean; unpackaged: boolean; band: number };
export type PostalRate = { serviceCode: string; serviceName: string; totalCents: number; taxCents: number; transitDays: number | null };
export type PostalQuote = { status: string; rates?: PostalRate[]; quoteId?: string; expiresAt?: string; packageCount?: number; bands?: number[]; postalCode?: string };
export const DEFAULT_WEIGHT_BANDS = [500, 2000, 5000, 30000] as const;
export const BAND_NAMES = ["Light", "Small", "Medium", "Heavy"] as const;
export function postalCode(value: string) { return value.trim().toUpperCase().replace(/\s/g, ""); }
export function validPostal(value: string) { return /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ]\d[ABCEGHJKLMNPRSTVWXYZ]\d$/.test(postalCode(value)); }
export function weightBand(grams: number, limits: readonly number[] = DEFAULT_WEIGHT_BANDS) {
  if (limits.length !== 4 || limits.some((n, i) => !Number.isInteger(n) || n <= (limits[i - 1] ?? 0) || n > 30000)) throw new Error("Invalid weight bands");
  if (!Number.isInteger(grams) || grams <= 0) return null;
  const index = limits.findIndex(n => grams <= n);
  return index < 0 ? null : index + 1;
}
export function validateItemIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 25 && new Set(value).size === value.length && value.every(id => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}
export function postalMessage(status: string) {
  return ({ login_required: "Sign in to calculate postal shipping.", invalid_postal: "Enter a valid Canadian postal code.", manual_review: "This bag needs a shipping review. Contact support before arranging delivery.", unavailable_items: "Some items are no longer available. Please refresh your bag.", not_configured: "Postal rates are not available yet. Support can help arrange delivery; no shipping price has been confirmed.", disabled: "Postal shipping is currently paused.", rate_limited: "Please wait a minute before requesting another quote.", no_services: "No postal service is available for all these packages. Please contact support.", expired: "This quote expired. Calculate shipping again.", unavailable: "Canada Post rates are temporarily unavailable. Please try again; no shipping fee has been confirmed." } as Record<string,string>)[status] ?? "Shipping could not be calculated. Please try again.";
}
