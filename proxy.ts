import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (process.env.VERCEL_ENV === "preview" && process.env.SHIKIMOMO_NEON_STAGING === "true") {
    const path=request.nextUrl.pathname;
    const marketplaceApi=/^\/api\/marketplace\/(photos(?:\/[a-f0-9-]{36})?|evidence|community)$/.test(path);
    const stripeTestApi=/^\/api\/payments\/test-(session|seller|webhook)$/.test(path)||path==='/api/cron/stripe-test-events';
    if(path.startsWith("/api/")&&!marketplaceApi&&!stripeTestApi) return NextResponse.json({error:"Unavailable in SQL staging"},{status:503});
    if(!/^\/staging(?:\/(?:community|payments))?$/.test(path) && !/^\/closet\/[a-f0-9-]{36}$/.test(path) && path!=="/sell" && path!=="/marketplace-rules" && !marketplaceApi && !stripeTestApi && !path.startsWith("/_next/") && !path.includes(".")) return NextResponse.redirect(new URL("/staging",request.url));
    const response=NextResponse.next();
    response.headers.set("Cache-Control","private, no-store");response.headers.set("X-Robots-Tag","noindex, nofollow, noarchive");return response;
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
