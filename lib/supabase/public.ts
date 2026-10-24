import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

/**
 * Stateless Supabase client for data that is intentionally public.
 *
 * Public reads must not inherit a visitor's auth cookies. A stale or
 * clock-skewed session should never be able to break the storefront.
 */
export function createPublicClient() {
  const { url, publishableKey } = getSupabaseConfig();

  return createSupabaseClient(url, publishableKey, {
    // This preview exercises the unavailable-catalogue state without making any network request.
    ...(url === "https://disabled.invalid" && process.env.NEXT_PUBLIC_STAGING_BACKEND === "seo" ? {
      global: { fetch: async () => new Response(JSON.stringify({ message: "Catalogue unavailable in rendering-only preview", code: "SEO_PREVIEW" }), { status: 503, headers: { "Content-Type": "application/json" } }) },
    } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
