"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";

function cents(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Invalid amount");
  return Math.round(parsed * 100);
}

function integer(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Invalid number");
  return parsed;
}

export async function addPilotCost(formData: FormData) {
  const { supabase, access } = await requireAdmin();
  if (!access.can_manage_selling_rules) redirect("/admin/pilot?type=error&message=Permission%20required");

  try {
    const category = String(formData.get("category") ?? "");
    const amountCents = cents(formData.get("amount"));
    const laborMinutes = integer(formData.get("labor_minutes"));
    const hourlyCostCents = cents(formData.get("hourly_cost"));
    const note = String(formData.get("note") ?? "").trim().slice(0, 500);
    const occurred = String(formData.get("occurred_at") ?? "").trim();

    const { error } = await supabase.rpc("admin_add_pilot_cost", {
      p_category: category,
      p_amount_cents: amountCents,
      p_labor_minutes: laborMinutes,
      p_hourly_cost_cents: hourlyCostCents,
      p_note: note || null,
      p_occurred_at: occurred ? new Date(occurred).toISOString() : new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    console.error("[pilot] cost entry failed", error);
    redirect("/admin/pilot?type=error&message=Could%20not%20save%20pilot%20cost");
  }

  revalidatePath("/admin/pilot");
  redirect("/admin/pilot?message=Pilot%20cost%20saved");
}
