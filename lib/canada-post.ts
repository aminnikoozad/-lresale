import type { Parcel, PostalRate } from "./postal.ts";
// Canada Post Rating 4.0 JSON/OAuth API, April 2026. No label-purchase endpoint.
const ROOT = "https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs";
export const SERVICES = ["DOM.RP", "DOM.EP", "DOM.XP", "DOM.PC"];
type Credentials = { clientId: string; clientSecret: string; customerNumber?: string; contractId?: string };
function money(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d{1,5}(\.\d{1,2})?$/.test(String(value))) throw new Error("Invalid carrier amount");
  return Math.round(Number(value) * 100);
}
export function parseRates(value: unknown): PostalRate[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Invalid carrier response");
  return value.filter(v => SERVICES.includes(v?.serviceCode)).map(v => {
    const totalCents = money(v.priceDetails?.due);
    const taxes = v.priceDetails?.taxes ?? {};
    const taxCents = ["gst", "pst", "hst"].reduce((sum, key) => sum + (taxes[key]?.amt == null ? 0 : money(taxes[key].amt)), 0);
    if (taxCents > totalCents || typeof v.serviceName !== "string" || !v.serviceName.length || v.serviceName.length > 120) throw new Error("Invalid carrier rate");
    const days = v.serviceStandard?.expectedTransitTime;
    return { serviceCode: v.serviceCode, serviceName: v.serviceName, totalCents, taxCents, transitDays: Number.isInteger(days) && days >= 0 && days <= 99 ? days : null };
  });
}
export function combineRates(packages: PostalRate[][]): PostalRate[] {
  if (!packages.length) return [];
  return packages[0].filter(rate => packages.every(p => p.some(r => r.serviceCode === rate.serviceCode))).map(rate => {
    const rows = packages.map(p => p.find(r => r.serviceCode === rate.serviceCode)!);
    return { ...rate, totalCents: rows.reduce((s,r) => s+r.totalCents,0), taxCents: rows.reduce((s,r) => s+r.taxCents,0), transitDays: rows.every(r => r.transitDays !== null) ? Math.max(...rows.map(r => r.transitDays!)) : null };
  }).sort((a,b) => a.totalCents-b.totalCents);
}
export function mailingScenario(parcel: Parcel, origin: string, destination: string, credentials: Credentials) {
  if ([parcel.weightGrams, parcel.lengthMm, parcel.widthMm, parcel.heightMm].some(n => !Number.isInteger(n) || n <= 0) || parcel.weightGrams > 30000 || Math.max(parcel.lengthMm,parcel.widthMm,parcel.heightMm)>2000) throw new Error("Parcel requires manual review");
  const [length,width,height] = [parcel.lengthMm,parcel.widthMm,parcel.heightMm].sort((a,b)=>b-a).map(n=>n/10);
  return { ...(credentials.customerNumber ? { customerNumber: credentials.customerNumber, ...(credentials.contractId ? { contractId: credentials.contractId } : {}) } : {}), quoteType: credentials.customerNumber ? "commercial" : "counter", parcelCharacteristics: { weight: parcel.weightGrams/1000, dimensions:{length,width,height}, mailingTube:parcel.mailingTube, unpackaged:parcel.unpackaged }, services: SERVICES, originPostalCode:origin, destination:{domestic:{postalCode:destination}} };
}
export async function canadaPostRates(parcels: Parcel[], origin: string, destination: string, credentials: Credentials, fetcher: typeof fetch = fetch): Promise<PostalRate[]> {
  const request = async (url: string, init: RequestInit) => {
    const response = await fetcher(url, { ...init, cache:"no-store", redirect:"error", signal:AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Carrier unavailable");
    const text = await response.text();
    if (text.length > 150000) throw new Error("Invalid carrier response");
    return JSON.parse(text);
  };
  const token = await request(`${ROOT}/cpc-api-native-oauth-provider/oauth2/token`, { method:"POST", headers:{"X-IBM-Client-Id":credentials.clientId,"X-IBM-Client-Secret":credentials.clientSecret,"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:"scope=merchant&grant_type=client_credentials" });
  if (typeof token.access_token !== "string" || !token.access_token || token.access_token.length > 10000) throw new Error("Invalid carrier token");
  const results: PostalRate[][] = [];
  // Bounded batches: never flood the carrier for a multi-item cart.
  for (let i=0;i<parcels.length;i+=4) {
    results.push(...await Promise.all(parcels.slice(i,i+4).map(async parcel => parseRates(await request(`${ROOT}/rating/v1/prices`, {method:"POST",headers:{Authorization:`Bearer ${token.access_token}`,"Content-Type":"application/json",Accept:"application/json","Accept-Language":"en-CA"},body:JSON.stringify(mailingScenario(parcel,origin,destination,credentials))})))));
  }
  return combineRates(results);
}
