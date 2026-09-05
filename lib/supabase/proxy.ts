import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

export async function updateSession(request: NextRequest) {
  let config: ReturnType<typeof getSupabaseConfig>;
  try {
    config = getSupabaseConfig();
  } catch {
    return NextResponse.next({ request });
  }

  const { url, publishableKey } = config;

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/admin")) {
    if (!claimsData?.claims) {
      return NextResponse.redirect(new URL("/secure-admin-login", request.url));
    }

    const { data, error } = await supabase.rpc("admin_access_context");
    const access = Array.isArray(data) ? data[0] : data;
    if (error || !access) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const isMfaRoute = pathname === "/admin/mfa" || pathname.startsWith("/admin/mfa/");
    if (!isMfaRoute && access.require_mfa && !access.has_aal2) {
      return NextResponse.redirect(new URL("/admin/mfa", request.url));
    }
  }

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", pathname.startsWith("/admin") || pathname === "/secure-admin-login" ? "noindex, nofollow, noarchive" : "all");
  return response;
}
