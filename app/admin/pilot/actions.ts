"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { isCatalogCategory } from "@/lib/catalog-taxonomy";

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

function optionalPositiveInteger(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) throw new Error("Optional item cap must be between 1 and 10,000");
  return parsed;
}

function torontoOffsetMinutes(at: Date) {
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    timeZoneName: "longOffset",
    hour: "2-digit",
  }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value;
  const match = zone?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Could not resolve Toronto timezone");
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

function torontoLocalToIso(input: string) {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Invalid local date/time");
  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let offset = torontoOffsetMinutes(new Date(localAsUtc));
  let instant = new Date(localAsUtc - offset * 60_000);
  const correctedOffset = torontoOffsetMinutes(instant);
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    instant = new Date(localAsUtc - offset * 60_000);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const roundTrip = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  if (roundTrip !== input) throw new Error("That Toronto local time is not valid");
  return instant.toISOString();
}

function pilotRedirect(message: string, type: "success" | "error" = "success") {
  const params = new URLSearchParams({ message });
  if (type === "error") params.set("type", "error");
  return `/admin/pilot?${params.toString()}`;
}

export async function updatePilotSettings(formData: FormData) {
  const { supabase, access } = await requireAdmin();
  if (!access.can_manage_selling_rules) redirect(pilotRedirect("Permission required", "error"));

  try {
    const enabled = formData.get("enabled") === "on";
    const categories = formData
      .getAll("categories")
      .map(String)
      .filter(isCatalogCategory);
    const pickupDays = formData
      .getAll("pickup_days")
      .map((value) => Number.parseInt(String(value), 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    const itemCap = optionalPositiveInteger(formData.get("item_cap"));
    const durationWeeks = integer(formData.get("duration_weeks"));
    const startRaw = String(formData.get("started_at") ?? "").trim();

    if (!categories.length) throw new Error("Select at least one category");
    if (!pickupDays.length) throw new Error("Select at least one pickup day");
    if (durationWeeks < 1 || durationWeeks > 52) throw new Error("Pilot duration must be between 1 and 52 weeks");

    const startedAt = startRaw ? torontoLocalToIso(startRaw) : new Date().toISOString();

    const { error } = await supabase.rpc("admin_save_pilot", {
      p_enabled: enabled,
      p_categories: categories,
      p_cap: itemCap,
      p_days: pickupDays,
      p_weeks: durationWeeks,
      p_start: startedAt,
    });
    if (error) throw error;
  } catch (error) {
    console.error("[pilot] settings update failed", error);
    redirect(pilotRedirect(error instanceof Error ? error.message : "Could not save pilot settings", "error"));
  }

  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath("/admin/pilot");
  redirect(pilotRedirect("Pilot settings saved. Storefront, intake and database enforcement now use these settings."));
}

export async function addPilotCost(formData: FormData) {
  const { supabase, access } = await requireAdmin();
  if (!access.can_manage_selling_rules) redirect(pilotRedirect("Permission required", "error"));

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
      p_occurred_at: occurred ? torontoLocalToIso(occurred) : new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    console.error("[pilot] cost entry failed", error);
    redirect(pilotRedirect("Could not save pilot cost", "error"));
  }

  revalidatePath("/admin/pilot");
  redirect(pilotRedirect("Pilot cost saved"));
}
