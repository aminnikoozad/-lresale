"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
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

async function rateKey(email: string) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  const salt = process.env.ADMIN_RATE_LIMIT_SALT || "rewear-admin-login-v1";
  return createHash("sha256").update(`${salt}|${email}|${ip}`).digest("hex");
}

export async function adminLogin(formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  const password = raw(formData, "password");
  if (!email || !password) redirect(message("Enter your credentials."));

  const supabase = await createClient();
  const key = await rateKey(email);
  const { data: limitData } = await supabase.rpc("check_admin_login_rate_limit", { p_rate_key: key });
  if (limitData && limitData.allowed === false) {
    const minutes = Math.max(1, Math.ceil(Number(limitData.retryAfterSeconds || 60) / 60));
    redirect(message(`Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`));
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await supabase.rpc("record_admin_login_failure", { p_rate_key: key });
    redirect(message("Access denied."));
  }

  const { data, error: accessError } = await supabase.rpc("admin_access_context");
  const access = Array.isArray(data) ? data[0] : data;
  if (accessError || !access) {
    await supabase.rpc("record_admin_login_failure", { p_rate_key: key });
    await supabase.auth.signOut();
    redirect(message("Access denied."));
  }

  await supabase.rpc("clear_admin_login_failures", { p_rate_key: key });
  if (access.require_mfa && !access.has_aal2) redirect("/admin/mfa");
  redirect("/admin");
}
