export const HOME_SUBCATEGORIES = [
  "Wall Art",
  "Mirrors",
  "Vases",
  "Candle Holders",
  "Decorative Objects",
  "Trays & Decorative Bowls",
  "Small Lamps & Lighting",
  "Clocks",
  "Decorative Tableware",
  "Bookends",
  "Small Home Textiles",
  "Vintage",
  "Collectibles",
  "Other Home Decor",
] as const;
export const HOME_ERAS = [
  "Contemporary",
  "2000s",
  "1990s",
  "1980s",
  "1970s",
  "1960s",
  "1950s",
  "Pre-1950",
  "Unknown",
] as const;
export const HOME_CONDITIONS = [
  "New / Unused",
  "Like New",
  "Excellent",
  "Very Good",
  "Good",
  "Fair / Collector Condition",
] as const;
export const HOME_STAGES = [
  "Received",
  "Initial Review",
  "Category Identification",
  "Condition Inspection",
  "Measurements",
  "Maker / Mark Review",
  "Photography",
  "Pricing Review",
  "Seller Approval",
  "Needs Specialist Review",
  "Compliance Review Required",
  "Ready to List",
  "Published",
] as const;
export const HOME_DEFECTS = [
  "scratches",
  "chips",
  "cracks",
  "stains",
  "fading",
  "tarnish",
  "oxidation",
  "paint loss",
  "missing pieces",
  "repairs",
  "restoration",
  "surface wear",
  "electrical condition",
  "other defect",
] as const;
export const HOME_REJECTIONS = [
  "too low resale value",
  "excessive damage",
  "unsafe item",
  "difficult or uneconomical shipping",
  "counterfeit / authenticity concern",
  "prohibited material",
  "excessive size or weight",
  "incomplete item",
  "hygiene issue",
  "unable to verify sufficient information",
] as const;
export const HOME_FLAGS = [
  "animal-derived material concern",
  "cultural property concern",
  "weapon-like object",
  "hazardous material",
  "restricted export concern",
  "authenticity concern",
] as const;
export const HOME_PHOTO_ROLES = [
  "hero",
  "front",
  "back",
  "side",
  "bottom",
  "maker mark",
  "label",
  "detail",
  "defect",
  "scale",
] as const;
export const HOME_TEXT_FIELDS = [
  "designer",
  "material",
  "primary_colour",
  "secondary_colour",
  "style",
  "country_of_origin",
  "model_collection",
  "condition_notes",
  "visible_defects",
  "missing_components",
  "restoration_history",
  "shipping_restrictions",
  "delivery_note",
  "provenance_notes",
  "keywords",
] as const;
export const HOME_NUMBER_FIELDS = [
  "height_cm",
  "width_cm",
  "depth_cm",
  "diameter_cm",
  "weight_kg",
  "approximate_year",
] as const;
export const HOME_BOOL_FIELDS = [
  "handmade",
  "signed_marked",
  "fragile",
  "oversized",
  "pickup_only",
] as const;
export const HOME_STAFF_FIELDS = [
  "seller_reported_age",
  "era_evidence",
  "authentication_evidence",
  "inspection_notes",
  "electrical_condition",
  "compliance_review_notes",
  "specialist_review_notes",
  "carrier_restriction",
] as const;
export const HOME_PACKAGE_FIELDS = [
  "packaged_length_cm",
  "packaged_width_cm",
  "packaged_height_cm",
  "packaged_weight_kg",
] as const;
export const HOME_CHECKS = [
  "clean",
  "structurally_sound",
  "suitable_for_resale",
  "no_severe_damage",
  "shippable",
  "inspectable",
  "resale_permitted",
  "marks_reviewed",
  "inspection_complete",
  "shipping_reviewed",
  "specialist_reviewed",
  "compliance_reviewed",
] as const;
export type HomeData = Record<string, string | number | boolean | null>;
export type HomePhoto = { url: string; role: string };
export type HomeDetails = {
  item_id: string;
  public_data: HomeData;
  staff_data: HomeData;
  checks: Record<string, boolean>;
  photos: HomePhoto[];
  inspection_stage: string;
  compliance_flags: string[];
  defects: string[];
  rejection_reason: string | null;
  missing?: string[];
};
export function fieldLabel(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\bcm\b/g, "(cm)")
    .replace(/\bkg\b/g, "(kg)")
    .replace(/^./, (s) => s.toUpperCase());
}
export function galleryOrder(photos: HomePhoto[]) {
  const rank = (r: string) =>
    r === "hero"
      ? 0
      : ["front", "back", "side", "bottom"].includes(r)
        ? 1
        : r === "defect"
          ? 3
          : 2;
  return [...photos].sort((a, b) => rank(a.role) - rank(b.role));
}
export function homeFormData(form: FormData) {
  const pub: HomeData = {};
  const staff: HomeData = {};
  for (const k of [
    ...HOME_TEXT_FIELDS,
    "subcategory",
    "era",
    "condition",
    "authentication_status",
  ]) {
    const v = String(form.get(k) ?? "").trim();
    if (v.length > 2000) throw new Error(`${fieldLabel(k)} is too long`);
    if (v) pub[k] = v;
  }
  for (const k of HOME_NUMBER_FIELDS) {
    const raw = String(form.get(k) ?? "").trim();
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || n > 100000)
        throw new Error(`Invalid ${fieldLabel(k)}`);
      pub[k] = n;
    }
  }
  for (const k of HOME_BOOL_FIELDS) pub[k] = form.get(k) === "on";
  for (const k of HOME_STAFF_FIELDS) {
    const v = String(form.get(k) ?? "").trim();
    if (v.length > 4000) throw new Error(`${fieldLabel(k)} is too long`);
    staff[k] = v;
  }
  for (const k of HOME_PACKAGE_FIELDS) {
    const raw = String(form.get(k) ?? "").trim();
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || n > 100000)
        throw new Error(`Invalid ${fieldLabel(k)}`);
      staff[k] = n;
    }
  }
  for (const k of [
    "double_box_recommended",
    "local_delivery_preferred",
    "manual_shipping_review_required",
    "specialist_review_required",
  ])
    staff[k] = form.get(k) === "on";
  return {
    public_data: pub,
    staff_data: staff,
    checks: Object.fromEntries(
      HOME_CHECKS.map((k) => [k, form.get(k) === "on"]),
    ),
    defects: form.getAll("defects").map(String),
    compliance_flags: form.getAll("compliance_flags").map(String),
    inspection_stage: String(form.get("inspection_stage") ?? "Received"),
    rejection_reason: String(form.get("rejection_reason") ?? "") || null,
  };
}
export const HOME_COLLECTIONS = [
  "New Home Finds",
  "Vintage Finds",
  "Under $50",
  "Decorative Objects",
  "Art & Wall Decor",
  "Unique Finds",
  "Collectibles",
  "Recently Added",
] as const;
export function homeCollectionMatches(
  collection: string,
  home: HomeData,
  priceCents: number,
  publishedAt: string | null,
  now: number,
) {
  if (collection === "Under $50") return priceCents < 5000;
  if (collection === "Vintage Finds") return home.subcategory === "Vintage";
  if (collection === "Collectibles") return home.subcategory === "Collectibles";
  if (collection === "Decorative Objects")
    return home.subcategory === "Decorative Objects";
  if (collection === "Art & Wall Decor") return home.subcategory === "Wall Art";
  if (collection === "Unique Finds")
    return home.handmade === true || home.signed_marked === true;
  if (collection === "New Home Finds" || collection === "Recently Added")
    return (
      !!publishedAt && now - new Date(publishedAt).getTime() <= 30 * 86400000
    );
  return true;
}
