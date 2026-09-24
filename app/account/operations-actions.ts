"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function resultUrl(message: string, type: "success" | "error") {
  const params = new URLSearchParams({ message, type });
  return `/account/operations?${params.toString()}`;
}

async function sellerClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

export async function scheduleAutoPublish(formData: FormData) {
  const supabase = await sellerClient();
  const itemId = text(formData, "item_id");
  const expectedPrice = Number(text(formData, "expected_price"));
  if (!itemId || !Number.isInteger(expectedPrice) || expectedPrice < 1) {
    redirect(resultUrl("Refresh the item and review its price again.", "error"));
  }
  const { error } = await supabase.rpc("seller_schedule_auto_publish", {
    target_item_id: itemId,
    expected_price: expectedPrice,
  });
  if (error) redirect(resultUrl(error.message || "Automatic publishing could not be scheduled.", "error"));
  revalidatePath("/account");
  revalidatePath("/account/operations");
  redirect(resultUrl("Price approved. The item is scheduled to publish automatically after the review window.", "success"));
}

export async function setUnsoldPreference(formData: FormData) {
  const supabase = await sellerClient();
  const itemId = text(formData, "item_id");
  const preference = text(formData, "preference");
  if (!itemId || !["return", "donate"].includes(preference)) {
    redirect(resultUrl("Choose Return to me or Donate / Reuse.", "error"));
  }
  const { error } = await supabase.rpc("set_item_disposition_preference", {
    target_item_id: itemId,
    target_preference: preference,
  });
  if (error) redirect(resultUrl(error.message || "Unsold-item preference could not be saved.", "error"));
  revalidatePath("/account");
  revalidatePath("/account/operations");
  redirect(resultUrl("Unsold-item preference saved.", "success"));
}
