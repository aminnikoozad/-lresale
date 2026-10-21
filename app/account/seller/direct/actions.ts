"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseDraftFields,parseDraftAction } from "@/lib/marketplace";
const route = "/account/seller/direct";
export async function saveDirectDraft(form: FormData) {
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${route}`);
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const id = text("id");
  const version = Number(text("version"));
  let fields:ReturnType<typeof parseDraftFields>;
  try { fields = parseDraftFields(form); } catch { redirect(`${route}?error=fields`); }
  if (!Number.isSafeInteger(version) || version < 0 || (id && !/^[0-9a-f-]{36}$/i.test(id))) redirect(`${route}?error=save`);
  const {error} = await supabase.rpc("save_marketplace_draft", {
    p_item: id || null, p_expected_version: version,
    p_fields: fields,
  });
  if (error) redirect(`${route}?error=save`);
  revalidatePath(route);
  redirect(`${route}?saved=1`);
}
export async function manageDirectDraft(form:FormData) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect(`/login?next=${route}`);
  let args:ReturnType<typeof parseDraftAction>;
  try {args=parseDraftAction(form);}catch{redirect(`${route}?error=action`);}
  const {error}=await supabase.rpc("manage_marketplace_draft",{p_item:args.id,p_expected_version:args.version,p_action:args.operation,p_request:args.request});
  if(error) redirect(`${route}?error=action`);
  revalidatePath(route);redirect(`${route}?updated=1`);
}
