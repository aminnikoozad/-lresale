export const productionSupabaseUrl = "https://lsdhobwrnmlkqnvkamlt.supabase.co";
export const productionPublishableKey = "sb_publishable_t1Yh4jSDgkhfWFL3t449MA_QhTiKw9c";

/** Rendering-only preview: no database, authentication or mutations. */
export function isSeoPreview(env: Record<string, string | undefined>) {
  return env.VERCEL_ENV === "preview" && env.NEXT_PUBLIC_APP_ENV === "staging" && env.NEXT_PUBLIC_STAGING_BACKEND === "seo";
}

/** Pure configuration validation. A preview must never silently reuse production. */
export function resolveSupabaseEnvironment(env: Record<string, string | undefined>) {
  if (env.NEXT_PUBLIC_STAGING_BACKEND === "seo") {
    if (!isSeoPreview(env)) throw new Error("SEO rendering preview is preview-only");
    return { url: "https://disabled.invalid", publishableKey: "sb_publishable_disabled_seo_preview" };
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const isolated = env.VERCEL_ENV === "preview" || env.NEXT_PUBLIC_APP_ENV === "staging";
  if (env.NEXT_PUBLIC_STAGING_BACKEND === "neon") {
    if (env.VERCEL_ENV === "production" || env.NEXT_PUBLIC_APP_ENV !== "staging") throw new Error("Neon SQL rehearsal is preview-only");
    return {url:"https://disabled.invalid",publishableKey:"sb_publishable_disabled_staging"};
  }
  if (Boolean(url) !== Boolean(key)) throw new Error("Configure both public Supabase URL and publishable key");
  if (isolated && (!url || url === productionSupabaseUrl)) throw new Error("Staging requires a separate Supabase project");
  if (url) {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) || parsed.origin !== url) {
      throw new Error("Invalid Supabase origin");
    }
  }
  if (key && !key.startsWith("sb_publishable_")) throw new Error("Use a publishable Supabase key");
  return { url: url || productionSupabaseUrl, publishableKey: key || productionPublishableKey };
}
