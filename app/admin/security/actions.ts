"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";

function raw(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function url(message: string, type: "success" | "error") {
  return `/admin/security?message=${encodeURIComponent(message)}&type=${type}`;
}

export async function changeAdminPassword(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const currentPassword = raw(formData, "current_password");
  const newPassword = raw(formData, "new_password");
  const confirmation = raw(formData, "password_confirmation");

  if (!user.email || currentPassword.length < 1) redirect(url("Enter your current password.", "error"));
  if (newPassword.length < 14) redirect(url("Use at least 14 characters for the Admin password.", "error"));
  if (newPassword !== confirmation) redirect(url("New passwords do not match.", "error"));
  if (newPassword === currentPassword) redirect(url("Choose a new password that is different from the current one.", "error"));

  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (verifyError) redirect(url("Current password is incorrect.", "error"));

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) redirect(url("The password could not be changed.", "error"));

  await supabase.auth.signOut({ scope: "global" });
  redirect(`/secure-admin-login?message=${encodeURIComponent("Admin password changed. Sign in again and complete MFA.")}`);
}

export async function signOutAllAdminSessions() {
  const { supabase } = await requireAdmin();
  await supabase.auth.signOut({ scope: "global" });
  redirect(`/secure-admin-login?message=${encodeURIComponent("All Admin sessions were signed out.")}`);
}
