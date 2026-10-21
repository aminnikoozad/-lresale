import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (process.env.VERCEL_ENV === "preview" && process.env.SHIKIMOMO_NEON_STAGING === "true") {
    const path=request.nextUrl.pathname;
    const marketplaceApi=/^\/api\/marketplace\/(photos(?:\/[a-f0-9-]{36})?|evidence|community)$/.test(path);
    if(path.startsWith("/api/")&&!marketplaceApi) return NextResponse.json({error:"Unavailable in SQL staging"},{status:503});
    if(!/^\/staging(?:\/community)?$/.test(path) && !/^\/closet\/[a-f0-9-]{36}$/.test(path) && path!=="/sell" && !marketplaceApi && !path.startsWith("/_next/") && !path.includes(".")) return NextResponse.redirect(new URL("/staging",request.url));
    const response=NextResponse.next();
    response.headers.set("Cache-Control","private, no-store");response.headers.set("X-Robots-Tag","noindex, nofollow, noarchive");return response;
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
