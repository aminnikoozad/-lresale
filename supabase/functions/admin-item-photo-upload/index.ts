import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function jwtPayload(token: string) {
  try {
    const part = token.split(".")[1];
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return {} as Record<string, unknown>;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    const { data: role, error: roleError } = await admin
      .from("admin_roles")
      .select("role,require_mfa")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError || !role || !["owner", "admin", "operations_manager", "warehouse"].includes(role.role)) {
      return json({ error: "Item management permission required" }, 403);
    }

    const payload = jwtPayload(token) as Record<string, unknown>;
    if (role.require_mfa && payload.aal !== "aal2") return json({ error: "MFA verification required" }, 403);

    const form = await req.formData();
    const itemId = String(form.get("item_id") || "").trim();
    const file = form.get("file");
    if (!itemId || !(file instanceof File) || file.size < 1) return json({ error: "Missing item or photo" }, 400);

    const allowed = new Map([
      ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/avif", "avif"],
    ]);
    const ext = allowed.get(file.type);
    if (!ext) return json({ error: "Unsupported photo type" }, 400);
    if (file.size > 8 * 1024 * 1024) return json({ error: "Photo exceeds 8 MB" }, 400);

    const { data: item, error: itemError } = await admin.from("items").select("id").eq("id", itemId).maybeSingle();
    if (itemError || !item) return json({ error: "Item not found" }, 404);

    const path = `${itemId}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from("item-photos").upload(path, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) return json({ error: uploadError.message }, 500);

    const { data } = admin.storage.from("item-photos").getPublicUrl(path);
    return json({ url: data.publicUrl, path });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Upload failed" }, 500);
  }
});
