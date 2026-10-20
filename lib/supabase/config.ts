import { resolveSupabaseEnvironment } from "./environment";
const config = resolveSupabaseEnvironment({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
});
export const SUPABASE_URL = config.url;
export const SUPABASE_PUBLISHABLE_KEY = config.publishableKey;
export function getSupabaseConfig() { return config; }
