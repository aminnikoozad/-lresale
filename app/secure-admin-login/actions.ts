"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function raw(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function message(message: string) {
  return `/secure-admin-login?message=${encodeURIComponent(message)}`;
}

export async function adminLogin(formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  const password = raw(formData, "password");
  if (!email || !password) redirect(message("Enter your credentials."));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(message("Access denied."));

  const { data, error: accessError } = await supabase.rpc("admin_access_context");
  const access = Array.isArray(data) ? data[0] : data;
  if (accessError || !access) {
    await supabase.auth.signOut();
    redirect(message("Access denied."));
  }

  if (access.require_mfa && !access.has_aal2) redirect("/admin/mfa");
  redirect("/admin");
}
