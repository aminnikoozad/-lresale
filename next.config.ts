import type { NextConfig } from "next";
import { getSupabaseConfig } from "./lib/supabase/config";

// Validate before a build/server starts, and keep image/network policy on the
// same project as the browser and server clients.
const supabaseEndpoint = new URL(getSupabaseConfig().url);
const supabaseOrigin = supabaseEndpoint.origin;
// The resolver permits HTTP only for explicitly isolated native loopback.
const isolatedLoopback = supabaseEndpoint.protocol === "http:";
const supabaseWebsocketOrigin = supabaseOrigin.replace(/^http/, "ws");
const supabaseConnections = process.env.NEXT_PUBLIC_SUPABASE_TEST_ISOLATION === "true"
  ? `${supabaseOrigin} ${supabaseWebsocketOrigin}`
  : `https://*.supabase.co wss://*.supabase.co ${supabaseOrigin} ${supabaseWebsocketOrigin}`;

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseConnections} https://challenges.cloudflare.com`,
  ...(isolatedLoopback ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Next otherwise rewrites literal loopback hosts to localhost in request.url,
  // breaking the isolated runtime's exact-origin callbacks and cookie boundary.
  // The shared resolver permits HTTP only for explicitly validated isolation.
  skipProxyUrlNormalize: isolatedLoopback,
  images: {
    // Local test images load directly under the narrow CSP. Keep Next's SSRF
    // protection enabled instead of allowing its optimizer to fetch private IPs.
    unoptimized: isolatedLoopback,
    remotePatterns: [
      {
        protocol: isolatedLoopback ? "http" : "https",
        hostname: supabaseEndpoint.hostname,
        port: supabaseEndpoint.port,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
