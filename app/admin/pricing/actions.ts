"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";

export async function setPricingEnabled(form: FormData) {
  const { supabase } = await requireAdmin();
  const enabled = String(form.get("enabled"));
  const version = Number(form.get("version"));
  if (!["true", "false"].includes(enabled) || !Number.isSafeInteger(version))
    throw new Error("Invalid pricing control");
  const { error } = await supabase.rpc("admin_set_pricing_enabled", {
    expected_version: version,
    enabled: enabled === "true",
    reason: String(form.get("reason") ?? "").trim(),
  });
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/items", "layout");
  redirect(`/admin/pricing?${new URLSearchParams({
    message: error?.message ?? "Pricing controls saved.",
    type: error ? "error" : "success",
  })}`);
}
