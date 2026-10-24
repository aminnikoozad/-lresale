import { requireAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { serviceCredentialReadiness } from "@/lib/supabase/service-readiness";
import { safeHttps } from "@/lib/pricing/visual";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const {supabase}=await requireAdmin();const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null,{status:404});
 const {data,error}=await supabase.rpc("admin_visual_pricing_photo",{target:id});
 const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
 if(error||!data) return new Response(null,{status:404,headers});
 if(data.url) {const url=safeHttps(data.url);if(url&&new URL(url).origin===new URL(getSupabaseConfig().url).origin&&new URL(url).pathname.startsWith("/storage/v1/object/public/")) return new Response(null,{status:302,headers:{...headers,Location:url}});}
 if(!data.key||data.provider!=="supabase"||!serviceCredentialReadiness(process.env,getSupabaseConfig().url).ready) return new Response(null,{status:404,headers});
 const storage=createClient(getSupabaseConfig().url,(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)!,{auth:{persistSession:false,autoRefreshToken:false}});
 const file=await storage.storage.from("shikimomo-listing-photos").download(data.key);
 if(file.error||!file.data||file.data.size>1500000) return new Response(null,{status:404,headers});
 return new Response(await file.data.arrayBuffer(),{headers:{...headers,"Content-Type":"image/webp"}});
}
