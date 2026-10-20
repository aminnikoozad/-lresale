"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCadCents } from "@/lib/marketplace";
const route = "/account/seller/direct";
export async function saveDirectDraft(form: FormData) {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${route}`);
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const id = text("id");
  const version = Number(text("version"));
  let price: number | null;
  try { price = parseCadCents(text("price")); } catch { redirect(`${route}?error=price`); }
  if (!Number.isSafeInteger(version) || version < 0 || (id && !/^[0-9a-f-]{36}$/i.test(id))) redirect(`${route}?error=save`);
  const fields = Object.fromEntries(["name", "brand_kind", "brand", "category", "size", "size_system", "item_condition", "color", "material", "description", "condition_notes"].map(key => [key, text(key)]));
  const {error} = await supabase.rpc("save_marketplace_draft", {
    p_item: id || null, p_expected_version: version,
    p_fields: {...fields, price_cents: price, label_absent: form.get("label_absent") === "on"},
  });
  if (error) redirect(`${route}?error=save`);
  revalidatePath(route);
  redirect(`${route}?saved=1`);
}
