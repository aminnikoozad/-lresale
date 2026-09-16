"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BUILD_ADMIN_RATE_LIMIT_SALT } from "@/lib/generated/admin-rate-limit-salt";
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

function rateLimitSalt() {
  const configured = process.env.ADMIN_RATE_LIMIT_SALT?.trim();
  return configured && configured.length >= 32 ? configured : BUILD_ADMIN_RATE_LIMIT_SALT;
}

async function rateKey(email: string) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  return createHmac("sha256", rateLimitSalt()).update(`${email}|${ip}`).digest("hex");
}

export async function adminLogin(formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  const password = raw(formData, "password");
  if (!email || email.length > 254 || !password || password.length > 1024) redirect(message("Enter your credentials."));

  const supabase = await createClient();
  const key = await rateKey(email);
  const { data: limitData, error: limitError } = await supabase.rpc("check_admin_login_rate_limit", { p_rate_key: key });
  if (limitError || typeof limitData?.allowed !== "boolean") {
    redirect(message("Sign-in protection is temporarily unavailable. Please try again shortly."));
  }
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
