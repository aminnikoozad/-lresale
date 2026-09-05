import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminAccess = {
  role: string;
  require_mfa: boolean;
  has_aal2: boolean;
  can_manage_pickups: boolean;
  can_manage_shipping: boolean;
  can_manage_security: boolean;
  can_manage_selling_rules: boolean;
};

export async function requireAdmin(options?: { requireMfa?: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/secure-admin-login");

  const { data, error } = await supabase.rpc("admin_access_context");
  const access = Array.isArray(data) ? data[0] : data;
  if (error || !access) notFound();

  const typed = access as AdminAccess;
  if ((options?.requireMfa ?? true) && typed.require_mfa && !typed.has_aal2) {
    redirect("/admin/mfa");
  }

  return { supabase, user, access: typed };
}
