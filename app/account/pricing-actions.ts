"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function acceptTeamPricing(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/operations");
  if (formData.get("pricing_mandate") !== "accepted") {
    redirect("/account/operations?type=error&message=Review%20and%20accept%20the%20team%20pricing%20terms.");
  }
  const { error } = await supabase.rpc("accept_team_pricing_mandate", { expected_version: "2026-10-15-team-v1" });
  if (error) redirect("/account/operations?type=error&message=Pricing%20terms%20could%20not%20be%20saved.%20Please%20try%20again.");
  revalidatePath("/account");
  revalidatePath("/account/operations");
  revalidatePath("/admin/items");
  redirect("/account/operations");
}
