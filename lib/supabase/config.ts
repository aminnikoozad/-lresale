const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (Boolean(configuredUrl) !== Boolean(configuredKey)) throw new Error("Configure both public Supabase URL and publishable key for this environment");
export const SUPABASE_URL = configuredUrl || "https://lsdhobwrnmlkqnvkamlt.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = configuredKey || "sb_publishable_t1Yh4jSDgkhfWFL3t449MA_QhTiKw9c";

export function getSupabaseConfig() {
  return { url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY };
}
