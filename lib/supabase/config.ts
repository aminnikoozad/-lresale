// Compatibility defaults for existing deployments. Test runs must explicitly
// enable isolation and supply a separate project's URL and publishable key.
// An approved native local runtime may instead use an explicit loopback origin.
const DEFAULT_SUPABASE_URL = "https://lsdhobwrnmlkqnvkamlt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_t1Yh4jSDgkhfWFL3t449MA_QhTiKw9c";

type SupabaseEnvironment = {
  url?: string;
  publishableKey?: string;
  testIsolation?: string;
};

export function resolveSupabaseConfig(environment: SupabaseEnvironment) {
  const { testIsolation } = environment;
  if (testIsolation !== undefined && testIsolation !== "true" && testIsolation !== "false") {
    throw new Error("NEXT_PUBLIC_SUPABASE_TEST_ISOLATION must be true or false.");
  }

  const isolated = testIsolation === "true";
  const hasOverride = environment.url !== undefined || environment.publishableKey !== undefined;
  if (!hasOverride && !isolated) {
    return { url: DEFAULT_SUPABASE_URL, publishableKey: DEFAULT_SUPABASE_PUBLISHABLE_KEY };
  }

  const url = environment.url?.trim();
  const publishableKey = environment.publishableKey?.trim();
  if (!url || !publishableKey) {
    throw new Error("Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Test isolation never uses production defaults.");
  }

  // Match the supplied text before URL normalization: shorthand/hex/octal IPs,
  // escaped hosts, dot paths, and backslashes must not become trusted loopback
  // origins. No DNS names (including localhost), proxies, or port defaults.
  // Native CLI ports are dynamically allocated in this bounded range.
  const loopback = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9]\d{4})\/?$/.exec(url);
  const loopbackPort = loopback ? Number(loopback[1]) : 0;
  const isolatedLoopback = isolated && loopbackPort >= 20000 && loopbackPort <= 32767;

  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS origin.");
  }

  if ((!isolatedLoopback && endpoint.protocol !== "https:") || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || endpoint.pathname !== "/") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin without credentials, path, query, or fragment.");
  }

  // Public configuration is bundled into the browser. Do not accept secret or
  // legacy JWT keys here (a JWT may carry the privileged service_role claim).
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key, never a secret or service-role key.");
  }

  if (isolated) {
    // Hosted targets still require canonical project origins. The sole local
    // exception is the explicit literal loopback origin validated above.
    if (!isolatedLoopback && (!/^[a-z0-9]{20}\.supabase\.co$/.test(endpoint.hostname) || endpoint.port)) {
      throw new Error("Test isolation requires a canonical https://<project-ref>.supabase.co origin or an explicit HTTP loopback origin on a native CLI port (20000-32767).");
    }
    if (endpoint.origin === DEFAULT_SUPABASE_URL || publishableKey === DEFAULT_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Test isolation refuses the production Supabase URL or publishable key.");
    }
  }

  return { url: endpoint.origin, publishableKey };
}

export function getSupabaseConfig() {
  // Keep these literal process.env accesses: Next.js only inlines statically
  // referenced NEXT_PUBLIC_* values. Set all three before building, then rebuild.
  return resolveSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    testIsolation: process.env.NEXT_PUBLIC_SUPABASE_TEST_ISOLATION,
  });
}
