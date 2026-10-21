import { resolvePublicProject } from "./project-config";

const configured = resolvePublicProject({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  preview: process.env.VERCEL_ENV === "preview",
  fallbackPublishableKey: "sb_publishable_t1Yh4jSDgkhfWFL3t449MA_QhTiKw9c",
});
export const SUPABASE_URL = configured.url;
export const SUPABASE_PUBLISHABLE_KEY = configured.publishableKey;

export function getSupabaseConfig() {
  return configured;
}
