import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = new Set(["https://lresale.vercel.app"]);
const base = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function headers(req: Request) {
  const origin = req.headers.get("origin");
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { ...base, "Access-Control-Allow-Origin": origin, "Vary": "Origin" }
    : base;
}
function okOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}
function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validMagic(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((x, i) => bytes[i] === x);
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "image/avif") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && ["avif", "avis", "mif1"].includes(String.fromCharCode(...bytes.slice(8, 12)));
  return false;
}

Deno.serve(async (req: Request) => {
  if (!okOrigin(req)) return json(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user || userData.user.is_anonymous) return json(req, { error: "Authentication required" }, 401);

    const { data: allowed, error: permissionError } = await userClient.rpc("can_manage_items");
    if (permissionError || !allowed) return json(req, { error: "Item management permission and MFA verification are required" }, 403);

    const form = await req.formData();
    const itemId = String(form.get("item_id") || "").trim();
    const file = form.get("file");
    if (!uuid(itemId) || !(file instanceof File) || file.size < 1) return json(req, { error: "Missing or invalid item/photo" }, 400);

    const types = new Map([
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["image/avif", "avif"],
    ]);
    const ext = types.get(file.type);
    if (!ext) return json(req, { error: "Unsupported photo type" }, 400);
    if (file.size > 8 * 1024 * 1024) return json(req, { error: "Photo exceeds 8 MB" }, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validMagic(file.type, bytes.slice(0, 32))) return json(req, { error: "Photo content does not match its declared image type" }, 400);

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: item, error: itemError } = await admin.from("items").select("id").eq("id", itemId).maybeSingle();
    if (itemError || !item) return json(req, { error: "Item not found" }, 404);

    const path = `${itemId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage.from("item-photos").upload(path, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) {
      console.error("admin photo upload failed", uploadError);
      return json(req, { error: "Photo upload failed" }, 500);
    }

    const { data } = admin.storage.from("item-photos").getPublicUrl(path);
    return json(req, { url: data.publicUrl, path });
  } catch (error) {
    console.error("admin-item-photo-upload failure", error);
    return json(req, { error: "Photo upload failed" }, 500);
  }
});
