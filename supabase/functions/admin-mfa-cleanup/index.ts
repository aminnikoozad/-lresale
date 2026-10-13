import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const localIsolation = Deno.env.get("REWEAR_LOCAL_TEST_ISOLATION");
if (localIsolation !== undefined && localIsolation !== "true" && localIsolation !== "false") {
  throw new Error("REWEAR_LOCAL_TEST_ISOLATION must be true or false.");
}
const isolatedLocal = localIsolation === "true";
const LOCAL_APP_ORIGIN = "http://127.0.0.1:3000";
const configuredOrigins = Deno.env.get("ALLOWED_APP_ORIGINS");
if (isolatedLocal) {
  // Validate raw text before normalization, and before reading any credentials.
  // A local CORS exception must never enable a hosted or DNS-routed backend.
  const loopback = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9]\d{4})\/?$/.exec(SUPABASE_URL ?? "");
  const port = loopback ? Number(loopback[1]) : 0;
  if (port < 20000 || port > 32767 || configuredOrigins !== LOCAL_APP_ORIGIN) {
    throw new Error("Local test isolation requires a literal HTTP loopback Supabase origin on port 20000-32767 and ALLOWED_APP_ORIGINS=http://127.0.0.1:3000.");
  }
}
const DEFAULT_ORIGIN = "https://lresale.vercel.app";
const ALLOWED_ORIGINS = new Set(
  isolatedLocal ? [LOCAL_APP_ORIGIN] : (configuredOrigins || DEFAULT_ORIGIN)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.origin : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean),
);
const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function headersFor(req: Request) {
  const origin = req.headers.get("origin");
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { ...baseHeaders, "Access-Control-Allow-Origin": origin, "Vary": "Origin" }
    : baseHeaders;
}
function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}
function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: headersFor(req) });
}

Deno.serve(async (req: Request) => {
  if (!originAllowed(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = SUPABASE_URL;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user || userData.user.is_anonymous) return json(req, { error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: roleRow, error: roleError } = await admin.from("admin_roles").select("role,require_mfa").eq("user_id", userData.user.id).maybeSingle();
    if (roleError || !roleRow || !["owner", "admin"].includes(roleRow.role)) return json(req, { error: "Forbidden" }, 403);

    // Recovery is intentionally limited to incomplete factors owned by the current admin.
    // Verified MFA factors are never removed here.
    const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: userData.user.id });
    if (listError) throw listError;

    const pending = (factors?.factors ?? []).filter((factor: any) => factor.status !== "verified");
    for (const factor of pending) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ userId: userData.user.id, id: factor.id });
      if (deleteError) throw deleteError;
    }

    return json(req, { deleted: pending.length });
  } catch (error) {
    console.error("admin-mfa-cleanup failure", error);
    return json(req, { error: "MFA cleanup failed. Sign in again and retry." }, 500);
  }
});
