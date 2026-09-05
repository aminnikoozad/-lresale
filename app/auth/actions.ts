"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPhoneVerificationRequired, normalizeCanadianPhone } from "@/lib/canadian-phone";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function rawText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function messageUrl(path: string, message: string, type: "error" | "success") {
  const params = new URLSearchParams({ message, type });
  return `${path}?${params.toString()}`;
}

async function requestOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredUrl?.startsWith("https://")) {
    return configuredUrl.replace(/\/$/, "");
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${productionHost}`;

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  return origin?.startsWith("http://localhost") ? origin : "https://lresale.vercel.app";
}

export async function login(formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  const password = rawText(formData, "password");
  if (!email || !password) {
    redirect(messageUrl("/login", "Enter your email and password.", "error"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(messageUrl("/login", "Email or password is incorrect.", "error"));
  }

  redirect(isPhoneVerificationRequired() && !data.user.phone_confirmed_at ? "/verify-phone" : "/account");
}

export async function signup(formData: FormData) {
  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLowerCase();
  const phone = normalizeCanadianPhone(text(formData, "phone"));
  const password = rawText(formData, "password");
  const confirmation = rawText(formData, "password_confirmation");

  if (fullName.length < 2 || fullName.length > 100) {
    redirect(messageUrl("/signup", "Enter your full name.", "error"));
  }
  if (!email || password.length < 8) {
    redirect(messageUrl("/signup", "Use a valid email and at least 8 password characters.", "error"));
  }
  if (isPhoneVerificationRequired() && !phone) {
    redirect(messageUrl("/signup", "Enter a valid Canadian phone number.", "error"));
  }
  if (password !== confirmation) {
    redirect(messageUrl("/signup", "The passwords do not match.", "error"));
  }
  if (formData.get("terms") !== "accepted") {
    redirect(messageUrl("/signup", "You must accept the account terms.", "error"));
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  const next = isPhoneVerificationRequired() ? "/verify-phone" : "/account";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone_e164: phone },
      emailRedirectTo: `${origin}/auth/callback?next=${next}`,
    },
  });

  if (error) {
    redirect(messageUrl("/signup", "We could not create the account. Try again shortly.", "error"));
  }
  if (data.session) redirect(next);

  redirect(messageUrl("/login", isPhoneVerificationRequired() ? "Check your email first. After signing in, we’ll verify your Canadian phone number." : "Check your email to verify your account, then sign in.", "success"));
}

export async function sendPhoneVerification(formData: FormData) {
  if (!isPhoneVerificationRequired()) redirect("/account");

  const phone = normalizeCanadianPhone(text(formData, "phone"));
  if (!phone) redirect(messageUrl("/verify-phone", "Enter a valid Canadian phone number.", "error"));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.phone_confirmed_at) redirect("/account");

  const { error } = await supabase.auth.updateUser({ phone });
  if (error) redirect(messageUrl("/verify-phone", "We could not send the SMS code. Try again shortly.", "error"));

  const { error: profileError } = await supabase.from("profiles").update({ phone }).eq("id", user.id);
  if (profileError) redirect(messageUrl("/verify-phone", "The phone number could not be saved. Try again.", "error"));

  redirect(messageUrl("/verify-phone", "A 6-digit code was sent to your phone.", "success"));
}

export async function verifyPhone(formData: FormData) {
  if (!isPhoneVerificationRequired()) redirect("/account");

  const token = text(formData, "token");
  if (!/^\d{6}$/.test(token)) redirect(messageUrl("/verify-phone", "Enter the 6-digit verification code.", "error"));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.phone_confirmed_at) redirect("/account");

  const { data: profile } = await supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle();
  const phone = normalizeCanadianPhone(profile?.phone ?? "");
  if (!phone) redirect(messageUrl("/verify-phone", "Send a verification code first.", "error"));

  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
  if (error) redirect(messageUrl("/verify-phone", "The code is incorrect or expired. Request a new code.", "error"));

  redirect(messageUrl("/account", "Your Canadian phone number is verified.", "success"));
}

export async function requestPasswordReset(formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  if (!email) {
    redirect(messageUrl("/forgot-password", "Enter your email address.", "error"));
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  });

  redirect(messageUrl("/forgot-password", "If the account exists, a reset link has been sent.", "success"));
}

export async function updatePassword(formData: FormData) {
  const password = rawText(formData, "password");
  const confirmation = rawText(formData, "password_confirmation");
  if (password.length < 8 || password !== confirmation) {
    redirect(messageUrl("/update-password", "Use matching passwords with at least 8 characters.", "error"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(messageUrl("/update-password", "This reset link is invalid or expired.", "error"));
  }

  redirect(messageUrl("/login", "Password updated. You can now sign in.", "success"));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
