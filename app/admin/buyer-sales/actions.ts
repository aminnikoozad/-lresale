"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/admin-auth";
function integer(f:FormData,key:string){const n=Number(f.get(key));if(!Number.isInteger(n))throw new Error("Invalid settings");return n;}
export async function saveBuyerOffer(f:FormData){
 const {supabase,access}=await requireAdmin();if(!access.has_aal2||!access.can_manage_selling_rules)throw new Error("MFA sales administrator required");
 const {error}=await supabase.rpc("admin_save_buyer_offer",{p_enabled:f.has("enabled"),p_bps:integer(f,"bps"),p_minimum:integer(f,"minimum"),p_cap:integer(f,"cap"),p_expected_version:integer(f,"version")});
 if(error)redirect("/admin/buyer-sales?error=1");revalidatePath("/admin/buyer-sales");redirect("/admin/buyer-sales?saved=1");
}
export async function disableBuyerCode(f:FormData){
 const {supabase,access}=await requireAdmin();if(!access.has_aal2||!access.can_manage_selling_rules)throw new Error("MFA sales administrator required");
 const id=String(f.get("code_id")||"");if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid code");
 const {error}=await supabase.rpc("admin_disable_buyer_code",{p_code:id,p_disabled:f.get("disabled")==="true"});
 if(error)redirect("/admin/buyer-sales?error=1");revalidatePath("/admin/buyer-sales");redirect("/admin/buyer-sales?saved=1");
}
export async function saveMessageControls(f:FormData){
 const {supabase,access}=await requireAdmin();if(!access.has_aal2||!access.can_manage_selling_rules)throw new Error("MFA sales administrator required");
 const {error}=await supabase.rpc("admin_save_buyer_messages",{p_enabled:f.has("enabled")});
 if(error)redirect("/admin/buyer-sales?error=1");revalidatePath("/admin/buyer-sales");redirect("/admin/buyer-sales?saved=1");
}
export async function saveCampaignCost(f:FormData){
 const {supabase,access}=await requireAdmin();if(!access.has_aal2||!access.can_manage_selling_rules)throw new Error("MFA sales administrator required");
 const variable=String(f.get("variable")||"").trim();
 const {error}=await supabase.rpc("admin_save_sales_campaign_cost",{p_campaign:String(f.get("campaign")||"").trim(),p_channel:String(f.get("channel")||"").trim(),p_start:String(f.get("start")||""),p_end:String(f.get("end")||""),p_advertising:integer(f,"advertising"),p_variable:variable?integer(f,"variable"):null});
 if(error)redirect("/admin/buyer-sales?error=1");revalidatePath("/admin/buyer-sales");redirect("/admin/buyer-sales?saved=1");
}
export async function attributeCampaignOrder(f:FormData){
 const {supabase,access}=await requireAdmin();if(!access.has_aal2||!access.can_manage_selling_rules)throw new Error("MFA sales administrator required");
 const {error}=await supabase.rpc("admin_attribute_sales_order",{p_order:String(f.get("order")||""),p_campaign:String(f.get("campaign")||"").trim(),p_channel:String(f.get("channel")||"").trim()});
 if(error)redirect("/admin/buyer-sales?error=1");revalidatePath("/admin/buyer-sales");redirect("/admin/buyer-sales?saved=1");
}
