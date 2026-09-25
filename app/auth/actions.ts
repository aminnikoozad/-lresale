"use server";

import { createClient as createAuthClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { protectAuthForm } from "@/lib/auth-form-protection";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPhoneVerificationRequired, normalizeCanadianPhone } from "@/lib/canadian-phone";
import { checkPasswordCompromise } from "@/lib/password-security";
import { PASSWORD_REQUIREMENTS_TEXT, passwordMeetsPolicy } from "@/lib/password-policy";

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

async function enforcePasswordSafety(password: string, path: "/signup" | "/update-password") {
  let compromised = false;
  try {
    ({ compromised } = await checkPasswordCompromise(password));
  } catch {
    redirect(messageUrl(path, "Password safety check is temporarily unavailable. Please try again shortly.", "error"));
  }

  if (compromised) {
    redirect(messageUrl(path, "This password has appeared in known data breaches. Choose a different password.", "error"));
  }
}

export async function validateRecoveryPassword(password: string, confirmation: string) {
  if (typeof password !== "string" || typeof confirmation !== "string" || password !== confirmation) {
    return { ok: false as const, message: "The passwords do not match." };
  }
  if (!passwordMeetsPolicy(password)) {
    return { ok: false as const, message: PASSWORD_REQUIREMENTS_TEXT };
  }
  if (password.length > 1024) {
    return { ok: false as const, message: "Choose a shorter password." };
  }
  try {
    const { compromised } = await checkPasswordCompromise(password);
    if (compromised) {
      return { ok: false as const, message: "This password has appeared in known data breaches. Choose a different password." };
    }
  } catch {
    return { ok: false as const, message: "Password safety check is temporarily unavailable. Please try again shortly." };
  }
  return { ok: true as const };
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
  const captchaToken = await protectAuthForm(formData, "/login");
  const email = text(formData, "email").toLowerCase();
  const password = rawText(formData, "password");
  if (!email || !password) {
    redirect(messageUrl("/login", "Enter your email and password.", "error"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) {
    redirect(messageUrl("/login", "Email or password is incorrect.", "error"));
  }

  redirect(isPhoneVerificationRequired() && !data.user.phone_confirmed_at ? "/verify-phone" : "/account");
}

export async function signup(formData: FormData) {
  const captchaToken = await protectAuthForm(formData, "/signup");
  const fullName = text(formData, "full_name");
  const username = text(formData, "username").toLowerCase();
  if (!/^[a-z0-9][a-z0-9._]{2,29}$/.test(username)) redirect(messageUrl("/signup", "Choose a valid username.", "error"));
  const email = text(formData, "email").toLowerCase();
  const phone = normalizeCanadianPhone(text(formData, "phone"));
  const password = rawText(formData, "password");
  const confirmation = rawText(formData, "password_confirmation");

  if (fullName.length < 2 || fullName.length > 100) {
    redirect(messageUrl("/signup", "Enter your full name.", "error"));
  }
  if (!email) {
    redirect(messageUrl("/signup", "Enter a valid email address.", "error"));
  }
  if (!passwordMeetsPolicy(password)) {
    redirect(messageUrl("/signup", PASSWORD_REQUIREMENTS_TEXT, "error"));
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

  await enforcePasswordSafety(password, "/signup");

  const supabase = await createClient();
  const origin = await requestOrigin();
  const next = isPhoneVerificationRequired() ? "/verify-phone" : "/account";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken,
      data: { full_name: fullName, phone_e164: phone, username },
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
  const captchaToken = await protectAuthForm(formData, "/forgot-password");
  const email = text(formData, "email").toLowerCase();
  if (!email) {
    redirect(messageUrl("/forgot-password", "Enter your email address.", "error"));
  }

  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createAuthClient(url, publishableKey, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const origin = await requestOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    captchaToken,
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  });

  if (error) redirect(messageUrl("/forgot-password", "We could not send a reset link. Please wait a moment and try again.", "error"));

  redirect(messageUrl("/forgot-password", "If the account exists, a reset link has been sent.", "success"));
}

// Retained for compatibility with older deployments. The current recovery form
// updates the password with the browser recovery session that came from the email link.
export async function updatePassword(formData: FormData) {
  const password = rawText(formData, "password");
  const confirmation = rawText(formData, "password_confirmation");
  if (password !== confirmation) {
    redirect(messageUrl("/update-password", "The passwords do not match.", "error"));
  }
  if (!passwordMeetsPolicy(password)) {
    redirect(messageUrl("/update-password", PASSWORD_REQUIREMENTS_TEXT, "error"));
  }

  await enforcePasswordSafety(password, "/update-password");

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
