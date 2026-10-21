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
  marketplace_details: {brandKind?: string; sizeSystem?: string; labelAbsent?: boolean; measurements?: Partial<Record<MeasurementKey,number>>};
  marketplace_closure_reason?: "archived" | "sold_elsewhere" | null;
  listing_version: number; status: string; updated_at: string;
};
export const measurementKeys = ["chest","waist","hip","length","sleeve","inseam","shoulder"] as const;
export type MeasurementKey = typeof measurementKeys[number];
export const draftActions = ["archive","restore","copy","sold_elsewhere"] as const;
export type DraftAction = typeof draftActions[number];
export function parseDraftFields(form:FormData) {
  const text=(key:string)=>String(form.get(key)??"").trim();
  const fields=Object.fromEntries(["name","brand_kind","brand","category","subcategory","size","size_system","item_condition","color","material","description","condition_notes"].map(key=>[key,text(key)]));
  const measurements:Partial<Record<MeasurementKey,number>>={};
  for(const key of measurementKeys) {
    const raw=text(`measurement_${key}`).replace(",", ".");
    if(!raw) continue;
    if(!/^\d{1,3}(\.\d{1,2})?$/.test(raw)||Number(raw)<0.1||Number(raw)>500) throw new Error("Invalid measurement");
    measurements[key]=Number(raw);
  }
  return {...fields,price_cents:parseCadCents(text("price")),label_absent:form.get("label_absent")==="on",measurements};
}
export function parseDraftAction(form:FormData) {
  const id=String(form.get("id")??""), request=String(form.get("request")??"");
  const operation=String(form.get("operation")??"");
  const version=Number(form.get("version"));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(id)||!uuid.test(request)||!Number.isSafeInteger(version)||version<1||!draftActions.includes(operation as DraftAction)) throw new Error("Invalid listing action");
  if((operation==="copy"||operation==="sold_elsewhere")&&form.get("confirmed")!=="on") throw new Error("Confirmation required");
  return {id,request,version,operation:operation as DraftAction};
}
