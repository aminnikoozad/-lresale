"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
export async function saveSmartShop(form:FormData) {
 const {supabase,access}=await requireAdmin();
 if(!access.has_aal2||!access.can_manage_selling_rules)throw new Error("Verified administrator permission required");
 const notice_en=String(form.get("notice_en")||"").trim();
 const notice_fr=String(form.get("notice_fr")||"").trim();
 if(notice_en.length>300||notice_fr.length>300)throw new Error("Notice is too long");
 const {error}=await supabase.from("smart_shop_settings").update({enabled:form.has("enabled"),chat_enabled:form.has("chat_enabled"),voice_enabled:form.has("voice_enabled"),memory_enabled:form.has("memory_enabled"),notice_en,notice_fr}).eq("id",1).select("id").single();
 if(error)redirect("/admin/smart-shop?error=save_failed");
 revalidatePath("/assistant");revalidatePath("/admin/smart-shop");
 redirect("/admin/smart-shop?saved=1");
}
