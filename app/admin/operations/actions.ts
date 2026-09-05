"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function message(message: string, type: "success" | "error") {
  return `/admin/operations?message=${encodeURIComponent(message)}&type=${type}`;
}

function torontoLocalToIso(local: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error("Invalid local date/time");
  const [, y, mo, d, h, mi] = match;
  const utcGuess = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcGuess);
  const offsetText = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT-4";
  const offsetMatch = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offsetText);
  const sign = offsetMatch?.[1] === "-" ? -1 : 1;
  const offsetMinutes = sign * ((Number(offsetMatch?.[2] ?? 4) * 60) + Number(offsetMatch?.[3] ?? 0));
  const actualUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) - offsetMinutes * 60_000;
  return new Date(actualUtc).toISOString();
}

export async function createPickupSlot(formData: FormData) {
  const { supabase } = await requireAdmin();
  try {
    const areaId = text(formData, "service_area_id");
    const start = torontoLocalToIso(text(formData, "window_start"));
    const end = torontoLocalToIso(text(formData, "window_end"));
    const capacity = Number(text(formData, "capacity"));
    if (!areaId || !Number.isInteger(capacity)) throw new Error("Invalid slot");
    const { error } = await supabase.rpc("admin_create_pickup_slot", {
      p_service_area_id: areaId,
      p_window_start: start,
      p_window_end: end,
      p_capacity: capacity,
    });
    if (error) throw error;
  } catch {
    redirect(message("Pickup slot could not be created. Check the time, area and capacity.", "error"));
  }
  revalidatePath("/account");
  revalidatePath("/admin/operations");
  redirect(message("Pickup slot created.", "success"));
}

export async function togglePickupSlot(formData: FormData) {
  const { supabase } = await requireAdmin();
  const slotId = text(formData, "slot_id");
  const active = text(formData, "active") === "true";
  const { error } = await supabase.rpc("admin_set_pickup_slot_active", { p_slot_id: slotId, p_active: active });
  if (error) redirect(message("Pickup slot could not be updated.", "error"));
  revalidatePath("/account");
  revalidatePath("/admin/operations");
  redirect(message(`Pickup slot ${active ? "activated" : "paused"}.`, "success"));
}

export async function toggleServiceArea(formData: FormData) {
  const { supabase } = await requireAdmin();
  const areaId = text(formData, "area_id");
  const active = text(formData, "active") === "true";
  const { error } = await supabase.rpc("admin_set_service_area_active", { p_area_id: areaId, p_active: active });
  if (error) redirect(message("Service area could not be updated.", "error"));
  revalidatePath("/account");
  revalidatePath("/admin/operations");
  redirect(message(`Service area ${active ? "activated" : "paused"}.`, "success"));
}

export async function updateReminderSettings(formData: FormData) {
  const { supabase } = await requireAdmin();
  const firstHours = Number(text(formData, "first_hours"));
  const secondHours = Number(text(formData, "second_hours"));
  const channel = text(formData, "channel");
  const { error } = await supabase.rpc("admin_update_pickup_reminder_settings", {
    p_enabled: formData.get("enabled") === "on",
    p_first_offset_minutes: Math.round(firstHours * 60),
    p_second_offset_minutes: Math.round(secondHours * 60),
    p_channel: channel,
    p_allow_email_fallback: formData.get("email_fallback") === "on",
  });
  if (error) redirect(message("Reminder settings could not be saved.", "error"));
  revalidatePath("/admin/operations");
  redirect(message("Reminder settings saved.", "success"));
}

export async function updateShippingSettings(formData: FormData) {
  const { supabase } = await requireAdmin();
  const radiusKm = Number(text(formData, "radius_km"));
  const mode = text(formData, "fee_mode");
  const flatFeeText = text(formData, "flat_fee");
  const flatFeeCents = flatFeeText ? Math.round(Number(flatFeeText) * 100) : null;
  const { error } = await supabase.rpc("admin_update_shipping_settings", {
    p_local_free_radius_km: radiusKm,
    p_nonlocal_fee_mode: mode,
    p_nonlocal_flat_fee_cents: flatFeeCents,
  });
  if (error) redirect(message("Shipping settings could not be saved.", "error"));
  revalidatePath("/admin/operations");
  revalidatePath("/");
  redirect(message("Canada-wide shipping settings saved.", "success"));
}
