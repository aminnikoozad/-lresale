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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
