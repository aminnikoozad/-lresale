import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_CATEGORIES, isCatalogCategory, type CatalogCategory } from "./catalog-taxonomy";

export type PilotSettings = {
  enabled: boolean;
  categories: CatalogCategory[];
  itemCap: number | null;
  pickupDays: number[];
  durationWeeks: number;
  startedAt: string | null;
};

export const DEFAULT_PILOT_SETTINGS: PilotSettings = {
  enabled: true,
  categories: ["women"],
  itemCap: null,
  pickupDays: [6],
  durationWeeks: 8,
  startedAt: "2026-09-24T00:00:00-04:00",
};

export function normalizePilotSettings(value: unknown): PilotSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_PILOT_SETTINGS;
  const row = value as Record<string, unknown>;
  const categories = Array.isArray(row.categories)
    ? row.categories.filter((category): category is CatalogCategory => typeof category === "string" && isCatalogCategory(category))
    : [];
  const pickupDays = Array.isArray(row.pickup_days)
    ? row.pickup_days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const rawItemCap = row.item_cap;
  const itemCap = rawItemCap === null || rawItemCap === undefined ? null : Number(rawItemCap);
  const durationWeeks = Number(row.duration_weeks);
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : DEFAULT_PILOT_SETTINGS.enabled,
    categories: categories.length ? categories : DEFAULT_PILOT_SETTINGS.categories,
    itemCap: itemCap === null ? null : Number.isInteger(itemCap) && itemCap > 0 ? itemCap : DEFAULT_PILOT_SETTINGS.itemCap,
    pickupDays: pickupDays.length ? pickupDays : DEFAULT_PILOT_SETTINGS.pickupDays,
    durationWeeks: Number.isInteger(durationWeeks) && durationWeeks > 0 ? durationWeeks : DEFAULT_PILOT_SETTINGS.durationWeeks,
    startedAt: typeof row.started_at === "string" && row.started_at ? row.started_at : DEFAULT_PILOT_SETTINGS.startedAt,
  };
}

export async function loadPilotSettings(supabase: SupabaseClient): Promise<PilotSettings> {
  try {
    const { data, error } = await supabase
      .from("pilot_settings")
      .select("enabled,categories,item_cap,pickup_days,duration_weeks,started_at")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return DEFAULT_PILOT_SETTINGS;
    return normalizePilotSettings(data);
  } catch {
    return DEFAULT_PILOT_SETTINGS;
  }
}

export function pilotAllowsCategory(category: string, settings: PilotSettings) {
  return !settings.enabled || settings.categories.includes(category as CatalogCategory);
}

export function activePilotCategories(settings: PilotSettings) {
  return settings.enabled
    ? CATALOG_CATEGORIES.filter((entry) => settings.categories.includes(entry.value))
    : CATALOG_CATEGORIES;
}

export function pilotAllowsPickupDate(value: string | Date, settings: PilotSettings) {
  if (!settings.enabled) return true;
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/Toronto",
  }).format(new Date(value));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return settings.pickupDays.includes(day);
}
