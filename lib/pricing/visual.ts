/** Visual matches are asking-price evidence, never verified model/authenticity or sold prices. */
export type FxRates = { date: string; rates: Record<string, number> };
export type VisualMatch = {
  title: string; url: string; thumbnail: string | null; source: string;
  condition: string | null; originalAmount: number | null; currency: string | null;
  cadCents: number | null; priceType: "listed"; matchType: "visual_unverified";
};
export type VisualEstimate = {
  version: "visual-listed-v1"; observedAt: string; fxDate: string | null;
  matches: VisualMatch[]; suggestedCents: number | null; lowCents: number | null;
  highCents: number | null; pricedCount: number; confidence: "low" | "insufficient";
  basis: "used_asking_prices" | "mixed_asking_prices" | "no_prices";
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
export function safeHttps(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try { const u = new URL(value); if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".") || u.hostname === "localhost" || /^(?:\d+\.){3}\d+$/.test(u.hostname) || u.hostname.includes(":")) return null; return u.href; } catch { return null; }
}
function currency(value: unknown) {
  const c = str(value, 20).toUpperCase();
  // A bare $ is ambiguous even when search localization is Canada.
  return ({CAD:"CAD", "CA$":"CAD", "C$":"CAD", USD:"USD", "US$":"USD", EUR:"EUR", "€":"EUR", GBP:"GBP", "£":"GBP"} as Record<string,string>)[c] ?? null;
}
export function estimateVisual(payload: unknown, fx: FxRates | null, now = new Date()): VisualEstimate {
  const data = record(payload);
  if (data.error || !Array.isArray(data.visual_matches)) throw new Error("provider_result_invalid");
  const seen = new Map<string, number>(); const matches: VisualMatch[] = [];
  for (const value of data.visual_matches.slice(0, 100)) {
    const r=record(value), url=safeHttps(r.link), title=str(r.title, 300);
    if (!url || !title) continue;
    const canonical = new URL(url); canonical.hash="";
    for (const key of [...canonical.searchParams.keys()]) if (/^utm_/i.test(key)||/^(gclid|fbclid|msclkid)$/i.test(key)) canonical.searchParams.delete(key);
    canonical.searchParams.sort();
    const duplicate=seen.get(canonical.href);
    const price=record(r.price), c=currency(price.currency);
    const amount=typeof price.extracted_value === "number" && Number.isFinite(price.extracted_value) && price.extracted_value>0 && price.extracted_value<=1000000 ? price.extracted_value : null;
    const rate = c === "CAD" ? 1 : c && fx && now.getTime()-Date.parse(fx.date)>=0 && now.getTime()-Date.parse(fx.date)<=7*86400000 ? fx.rates[c] : null;
    const converted = amount !== null && typeof rate === "number" && Number.isFinite(rate) && rate>0 ? Math.round(amount*rate*100) : null;
    const candidate:VisualMatch={title,url,thumbnail:safeHttps(r.thumbnail),source:str(r.source,100)||new URL(url).hostname, condition:str(r.condition,80)||null,originalAmount:amount,currency:c,cadCents:converted && converted<=100000000 ? converted : null,priceType:"listed",matchType:"visual_unverified"};
    if(duplicate!==undefined) {
      if(matches[duplicate].cadCents===null&&candidate.cadCents!==null) matches[duplicate]=candidate;
      continue;
    }
    seen.set(canonical.href,matches.length);
    matches.push(candidate);
    if(matches.length===30) break;
  }
  const priced=matches.filter(m=>m.cadCents!==null);
  const used=priced.filter(m=>/^(used|pre-owned|preowned|second.hand|occasion)$/i.test(m.condition??""));
  const evidence=used.length ? used : priced;
  const prices=evidence.map(m=>m.cadCents!).sort((a,b)=>a-b);
  const at=(q:number)=>{
    if(!prices.length) return null;
    const index=(prices.length-1)*q, lower=Math.floor(index), upper=Math.ceil(index);
    return Math.round(prices[lower]+(prices[upper]-prices[lower])*(index-lower));
  };
  return {version:"visual-listed-v1",observedAt:now.toISOString(),fxDate:fx?.date??null,matches,suggestedCents:at(.5),lowCents:at(.25),highCents:at(.75),pricedCount:prices.length,confidence:prices.length?"low":"insufficient",basis:used.length?"used_asking_prices":prices.length?"mixed_asking_prices":"no_prices"};
}
