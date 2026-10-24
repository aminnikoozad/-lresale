"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { processVisualPricingJob, visualSearchReady } from "@/lib/pricing/visual-server";
const value=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function done(error:boolean) {revalidatePath("/admin/visual-pricing");revalidatePath("/admin/pricing");revalidatePath("/admin/items","layout");redirect(`/admin/visual-pricing?${error?"error=1":"saved=1"}`);}
export async function toggleVisualSearch(f:FormData) {
 const {supabase}=await requireAdmin(); const enabled=value(f,"enabled");
 if(!["true","false"].includes(enabled)||(enabled==="true"&&!visualSearchReady())) done(true);
 const {error}=await supabase.rpc("admin_set_visual_pricing",{expected_version:Number(value(f,"version")),enabled:enabled==="true",reason:value(f,"reason")});done(Boolean(error));
}
export async function reviewVisualPrice(f:FormData) {
 const {supabase}=await requireAdmin(); const job=value(f,"job"),price=value(f,"price");
 if(!uuid.test(job)||!/^\d+(\.\d{1,2})?$/.test(price)||value(f,"reviewed")!=="yes") done(true);
 const {error}=await supabase.rpc("admin_review_visual_price",{job,price_cents:Math.round(Number(price)*100),reason:value(f,"reason")});done(Boolean(error));
}
export async function requestVisualSearch(f:FormData) {
 const {supabase}=await requireAdmin();const target=value(f,"item");if(!uuid.test(target)) done(true);
 const {error}=await supabase.rpc("admin_request_visual_pricing",{target});done(Boolean(error));
}
export async function runVisualSearch() {
 const {supabase}=await requireAdmin(); const access=await supabase.rpc("admin_visual_pricing_queue",{});
 if(access.error||!access.data?.canManage||!visualSearchReady()) done(true);
 try {await processVisualPricingJob();} catch {done(true);} done(false);
}
export async function setVisualPriceEmail(f:FormData) {
 const {supabase}=await requireAdmin(); const enabled=value(f,"enabled");
 if(!["true","false"].includes(enabled)) done(true);
 const {error}=await supabase.rpc("admin_set_visual_price_email",{enabled:enabled==="true"});done(Boolean(error));
}
