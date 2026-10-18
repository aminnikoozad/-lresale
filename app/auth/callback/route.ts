import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const google = url.searchParams.get("provider") === "google";
  const next = safeRedirectPath(url.searchParams.get("next"), url.origin);

  // URL fragments are available only in the browser; the recovery page verifies them.
  if (!code && next === "/update-password") {
    return NextResponse.redirect(new URL("/update-password", url.origin));
  }

  // Fragments never reach this server. Forward them intact to the browser handler.
  if (!code && !google && !url.searchParams.has("error") && !url.searchParams.has("error_code")) {
    const response = NextResponse.redirect(new URL("/auth/complete", url.origin));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const failure = new URL(next === "/update-password" ? "/forgot-password" : "/login", url.origin);
  failure.searchParams.set("type", "error");
  failure.searchParams.set("message", google ? "Google sign-in was not completed. Please try again or sign in with your email." : next === "/update-password" ? "This reset link could not be verified. Request a new link and use the latest email." : "We could not complete sign-in with this link. If you have already confirmed your email, sign in with your password. Otherwise, use the latest confirmation email.");
  return NextResponse.redirect(failure);
}
