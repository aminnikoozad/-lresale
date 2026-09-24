"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function url(message: string, type: "success" | "error") {
  const params = new URLSearchParams({ message, type });
  return `/admin/processing?${params.toString()}`;
}

async function authorizedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/secure-admin-login");
  const { data: allowed, error } = await supabase.rpc("can_manage_items");
  if (error || !allowed) redirect(url("Item operations permission is required.", "error"));
  return supabase;
}

export async function createWarehouseLocation(formData: FormData) {
  const supabase = await authorizedClient();
  const code = text(formData, "code").toUpperCase();
  const label = text(formData, "label");
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(code)) redirect(url("Use a short location code such as A-03-B12.", "error"));
  const { error } = await supabase.rpc("admin_create_warehouse_location", {
    target_code: code,
    target_label: label || null,
  });
  if (error) redirect(url(error.message || "Location could not be created.", "error"));
  revalidatePath("/admin/processing");
  redirect(url("Warehouse location created.", "success"));
}

export async function assignWarehouseLocation(formData: FormData) {
  const supabase = await authorizedClient();
  const itemId = text(formData, "item_id");
  const locationId = text(formData, "location_id");
  if (!itemId || !locationId) redirect(url("Choose an item and warehouse location.", "error"));
  const { error } = await supabase.rpc("admin_assign_item_location", {
    target_item_id: itemId,
    target_location_id: locationId,
  });
  if (error) redirect(url(error.message || "Location could not be assigned.", "error"));
  revalidatePath("/admin/processing");
  redirect(url("Item location updated.", "success"));
}

export async function runOperationsAutomation() {
  const supabase = await authorizedClient();
  const { data, error } = await supabase.rpc("admin_run_rewear_ops_automations");
  if (error) redirect(url(error.message || "Automation could not be run.", "error"));
  revalidatePath("/admin/processing");
  revalidatePath("/account");
  revalidatePath("/");
  const result = data && typeof data === "object" ? JSON.stringify(data) : "completed";
  redirect(url(`Automation ${result}`, "success"));
}
