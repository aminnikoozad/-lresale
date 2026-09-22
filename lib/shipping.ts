export type ShippingWeightClass = "light" | "standard" | "medium" | "large";

export const SHIPPING_WEIGHT_CLASSES = [
  { id: "light" as const, label: "Light", minKg: 0, maxKg: 0.5 },
  { id: "standard" as const, label: "Standard", minKg: 0.5, maxKg: 2 },
  { id: "medium" as const, label: "Medium", minKg: 2, maxKg: 5 },
  { id: "large" as const, label: "Large", minKg: 5, maxKg: 30 },
];

export function weightClassFor(weightKg: number): ShippingWeightClass {
  if (weightKg <= 0.5) return "light";
  if (weightKg <= 2) return "standard";
  if (weightKg <= 5) return "medium";
  return "large";
}

export function defaultItemWeightKg(category?: string | null) {
  switch (category) {
    case "kids":
    case "accessories": return 0.35;
    case "women":
    case "men": return 0.6;
    case "shoes": return 1.2;
    case "electronics": return 1.5;
    case "home_decor": return 2.5;
    default: return 0.6;
  }
}

export function parcelWeightKg(items: Array<{ weightKg?: number | null; category?: string | null }>) {
  const contents = items.reduce((sum, item) => {
    const explicit = Number(item.weightKg);
    return sum + (Number.isFinite(explicit) && explicit > 0 ? explicit : defaultItemWeightKg(item.category));
  }, 0);
  return Math.min(30, Math.max(0.1, Math.round((contents + 0.2) * 100) / 100));
}

export function normalizeCanadianPostalCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
