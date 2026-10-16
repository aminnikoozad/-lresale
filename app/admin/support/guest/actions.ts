"use server";
import {requireAdmin} from "@/lib/admin-auth";import {redirect} from "next/navigation";import {revalidatePath} from "next/cache";
export async function reviewGuestInquiry(f:FormData){const {supabase,access}=await requireAdmin();if(!access.has_aal2)throw new Error("MFA required");const {error}=await supabase.rpc("admin_review_guest_inquiry",{p_inquiry:String(f.get("id")||""),p_status:String(f.get("status")||"")});if(error)redirect("/admin/support/guest?error=1");revalidatePath("/admin/support/guest");redirect("/admin/support/guest");}
