import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isSeoPreview } from "@/lib/supabase/environment";

export async function proxy(request: NextRequest) {
  if (isSeoPreview(process.env)) {
    const path = request.nextUrl.pathname;
    const publicPages = ["/", "/shop", "/sell", "/sell-with-shikimomo", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"];
    const allowed = publicPages.includes(path) || path.startsWith("/_next/");
    const response = !["GET", "HEAD"].includes(request.method) || !allowed
      ? NextResponse.json({ error: "Unavailable in rendering-only preview" }, { status: 503 })
      : NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }
  if (process.env.VERCEL_ENV === "preview" && process.env.SHIKIMOMO_NEON_STAGING === "true") {
    const path=request.nextUrl.pathname;
    const marketplaceApi=/^\/api\/marketplace\/(photos(?:\/[a-f0-9-]{36})?|evidence|community)$/.test(path);
    if(path.startsWith("/api/")&&!marketplaceApi) return NextResponse.json({error:"Unavailable in SQL staging"},{status:503});
    if(!/^\/staging(?:\/community)?$/.test(path) && !/^\/closet\/[a-f0-9-]{36}$/.test(path) && path!=="/sell" && path!=="/marketplace-rules" && !marketplaceApi && !path.startsWith("/_next/") && !path.includes(".")) return NextResponse.redirect(new URL("/staging",request.url));
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
