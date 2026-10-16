const PRODUCTION_URL = "https://lsdhobwrnmlkqnvkamlt.supabase.co";
const PRODUCTION_PUBLISHABLE_KEY = "sb_publishable_t1Yh4jSDgkhfWFL3t449MA_QhTiKw9c";

type PublicEnvironment = { mode?: string; url?: string; publishableKey?: string };

/** A test auth email must never send its callback to the production application. */
export function resolveTestSiteOrigin(value: string | undefined) {
  if (!value?.trim()) throw new Error("TEST_SITE_URL is required for test authentication");
  const url = new URL(value.trim());
  const host = url.hostname.replace(/\.$/, "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const productionHosts = ["shikimomo.com", "www.shikimomo.com", "lresale.vercel.app",
    "lresale-aminnikoozad1371-4252.vercel.app", "lresale-git-main-aminnikoozad1371-4252.vercel.app"];
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      productionHosts.includes(host)) {
    throw new Error("TEST_SITE_URL must be a separate test application origin");
  }
  return url.origin;
}

/** Explicit opt-in; a test build must never fall back to the production project. */
export function resolveSupabaseConfig(env: PublicEnvironment) {
  if (!env.mode || env.mode === "production") {
    return { url: PRODUCTION_URL, publishableKey: PRODUCTION_PUBLISHABLE_KEY, isTest: false };
  }
  if (env.mode !== "test") throw new Error("Unknown Shikimomo environment");
  if (!env.url?.trim() || !env.publishableKey?.trim()) {
    throw new Error("Test Supabase URL and publishable key are required");
  }
  const url = new URL(env.url.trim());
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      url.hostname.replace(/\.$/, "") === new URL(PRODUCTION_URL).hostname) {
    throw new Error("Test Supabase must use a separate project or loopback service");
  }
  const publishableKey = env.publishableKey.trim();
  if (!publishableKey.startsWith("sb_publishable_") || publishableKey === PRODUCTION_PUBLISHABLE_KEY) {
    throw new Error("Test configuration requires its own publishable key");
  }
  return { url: url.origin, publishableKey, isTest: true };
}

export function getSupabaseConfig() {
  // Direct references are required for Next.js to inline the same values in the browser.
  return resolveSupabaseConfig({
    mode: process.env.NEXT_PUBLIC_SHIKIMOMO_ENV,
    url: process.env.NEXT_PUBLIC_TEST_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_TEST_SUPABASE_PUBLISHABLE_KEY,
  });
}
