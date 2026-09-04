"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(messageUrl("/login", "Email or password is incorrect.", "error"));
  }

  redirect("/account");
}

export async function signup(formData: FormData) {
  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLowerCase();
  const password = rawText(formData, "password");
  const confirmation = rawText(formData, "password_confirmation");

  if (fullName.length < 2 || fullName.length > 100) {
    redirect(messageUrl("/signup", "Enter your full name.", "error"));
  }
  if (!email || password.length < 8) {
    redirect(messageUrl("/signup", "Use a valid email and at least 8 password characters.", "error"));
  }
  if (password !== confirmation) {
    redirect(messageUrl("/signup", "The passwords do not match.", "error"));
  }
  if (formData.get("terms") !== "accepted") {
    redirect(messageUrl("/signup", "You must accept the account terms.", "error"));
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/account`,
    },
  });

  if (error) {
    redirect(messageUrl("/signup", "We could not create the account. Try again shortly.", "error"));
  }
  if (data.session) redirect("/account");

  redirect(messageUrl("/login", "Check your email to verify your account, then sign in.", "success"));
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
