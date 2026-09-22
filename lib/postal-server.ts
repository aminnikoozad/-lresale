import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

export function postalReadiness() {
  return { carrier: Boolean(process.env.CANADA_POST_CLIENT_ID && process.env.CANADA_POST_CLIENT_SECRET), production: process.env.CANADA_POST_MODE === "production", storage: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) };
}
export function postalStorage() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Postal storage is not configured");
  return createClient(getSupabaseConfig().url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
