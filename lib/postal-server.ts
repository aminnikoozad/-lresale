import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

export function postalReadiness() {
  // Shared preview credentials cannot be assumed to belong to the public test
  // project. Also gate carrier calls through the quote route's readiness check.
  if (process.env.NEXT_PUBLIC_SUPABASE_TEST_ISOLATION === "true") {
    return { carrier: false, production: false, storage: false };
  }
  return { carrier: Boolean(process.env.CANADA_POST_CLIENT_ID && process.env.CANADA_POST_CLIENT_SECRET), production: process.env.CANADA_POST_MODE === "production", storage: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) };
}
export function postalStorage() {
  // Validate public config before accessing either privileged key. There is no
  // key/project attestation flow yet, so isolation blocks privileged clients.
  const { url } = getSupabaseConfig();
  if (process.env.NEXT_PUBLIC_SUPABASE_TEST_ISOLATION === "true") {
    throw new Error("Privileged Supabase clients are disabled in test isolation pending separate authorized server configuration.");
  }
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Postal storage is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
