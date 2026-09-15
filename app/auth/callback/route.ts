import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"), url.origin);

  // URL fragments are available only in the browser; the recovery page verifies them.
  if (!code && next === "/update-password") {
    return NextResponse.redirect(new URL("/update-password", url.origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const failure = new URL(next === "/update-password" ? "/forgot-password" : "/login", url.origin);
  failure.searchParams.set("type", "error");
  failure.searchParams.set("message", next === "/update-password" ? "This reset link could not be verified. Request a new link and use the latest email." : "The verification link is invalid or expired.");
  return NextResponse.redirect(failure);
}
