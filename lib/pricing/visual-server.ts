import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { serviceCredentialReadiness } from "@/lib/supabase/service-readiness";
import { estimateVisual, safeHttps, type FxRates } from "./visual";

export function visualSearchReady() {
  return Boolean(process.env.SERPAPI_API_KEY?.trim()) && serviceCredentialReadiness(process.env,getSupabaseConfig().url).ready;
}
async function boundedJson(response: Response, maxBytes: number) {
  if (!response.ok || !response.body) throw new Error("search_unavailable");
  const reader=response.body.getReader(); const chunks:Uint8Array[]=[]; let bytes=0;
  try { for (;;) { const {value,done}=await reader.read(); if(done) break; bytes+=value.length; if(bytes>maxBytes) throw new Error("response_too_large"); chunks.push(value); } }
  finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string,unknown>;
}
async function exchangeRates(signal:AbortSignal):Promise<FxRates|null> {
  try {
    const data=await boundedJson(await fetch("https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD,FXGBPCAD/json?recent=1",{signal,cache:"no-store",redirect:"error"}),200000);
    const observations=data.observations as Array<{d:string;FXUSDCAD?:{v:string};FXEURCAD?:{v:string};FXGBPCAD?:{v:string}}>;
    const row=observations?.at(-1); if(!row?.d) return null;
    return {date:row.d,rates:{USD:Number(row.FXUSDCAD?.v),EUR:Number(row.FXEURCAD?.v),GBP:Number(row.FXGBPCAD?.v)}};
  } catch {return null;}
}
export async function processVisualPricingJob(intakeId?:string) {
  if(!visualSearchReady()) throw new Error("Visual search is not configured");
  const storage=createClient(getSupabaseConfig().url,(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)!,{auth:{persistSession:false,autoRefreshToken:false}});
  let claimed=await storage.rpc("claim_visual_intake_job",{target:intakeId??null});
  if(!claimed.error&&!claimed.data&&!intakeId) claimed=await storage.rpc("claim_visual_pricing_job");
  if(claimed.error) throw new Error("Visual queue unavailable");
  if(!claimed.data) return {claimed:0,completed:0};
  const job=claimed.data as {id:string;token:string;kind?:string;image:{key?:string;provider?:string;url?:string}};
  let result:ReturnType<typeof estimateVisual>|null=null, failure:string|null=null;
  try {
    let image:string|null=null;
    if(job.image.key && job.image.provider==="supabase") {
      const signed=await storage.storage.from("shikimomo-listing-photos").createSignedUrl(job.image.key,120);
      if(signed.error) throw new Error("image_unavailable"); image=signed.data.signedUrl;
    } else if(job.image.url) {
      // Only this project's actual storage objects may be submitted to the provider.
      // Never hand user-supplied arbitrary URLs, cookies or internal endpoints to it.
      const url=safeHttps(job.image.url), base=new URL(getSupabaseConfig().url);
      if(url) {const u=new URL(url); if(u.origin===base.origin && u.pathname.startsWith("/storage/v1/object/public/")) image=url;}
    }
    if(!image) throw new Error("image_unavailable");
    const signal=AbortSignal.timeout(35000);
    const url=new URL("https://serpapi.com/search.json");
    url.search=new URLSearchParams({engine:"google_lens",type:"visual_matches",url:image,country:"ca",hl:"en",api_key:process.env.SERPAPI_API_KEY!.trim()}).toString();
    const payload=await boundedJson(await fetch(url,{signal,cache:"no-store",redirect:"error"}),1500000);
    const fx=await exchangeRates(AbortSignal.timeout(5000));
    // Persist only normalized matches, never API keys, signed input URLs or raw provider payloads.
    result=estimateVisual(payload,fx);
  } catch {failure="search_unavailable";}
  const saved=await storage.rpc(job.kind==="intake"?"finish_visual_intake_job":"finish_visual_pricing_job",{target:job.id,token:job.token,result,failure_code:failure});
  if(saved.error) throw new Error("Visual result could not be saved");
  return {claimed:1,completed:failure?0:1};
}
