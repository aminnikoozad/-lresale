"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { isGoogleSignInEnabled } from "@/lib/google-auth";

export async function signInWithGoogle(formData: FormData) {
  const next = safeRedirectPath(String(formData.get("next") || "/account"), "https://shikimomo.com");
  const failure = "/login?" + new URLSearchParams({ type: "error", message: "Google sign-in is unavailable. Please sign in with your email or try again later.", next });
  if (!(await isGoogleSignInEnabled())) redirect(failure);
  const supabase = await createClient();
  const callback = new URL("https://shikimomo.com/auth/callback");
  callback.searchParams.set("next", next);
  callback.searchParams.set("provider", "google");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect(failure);
  redirect(data.url);
}
