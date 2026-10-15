export type AssistantProduct = {
  id: string;
  name: string;
  brand: string;
  priceCents: number;
  photoUrl: string;
  size: string | null;
  condition: string | null;
  category: string;
  color?: string | null;
};
export type AssistantOperation = {
  name: string;
  fields: Record<string, string>;
  summary: string;
};
export type AssistantResult = {
  reply: string;
  products?: AssistantProduct[];
  operation?: AssistantOperation | null;
  preferences?: Record<string, string>;
  alertQuery?: Record<string, string> | null;
};
export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: AssistantResult;
};
export const ASSISTANT_OPERATIONS = {
  add_to_bag: ["item_id"],
  remove_from_bag: ["item_id"],
  checkout: [
    "recipient_name",
    "address_line1",
    "city",
    "province",
    "postal_code",
  ],
  favorite: ["item_id"],
  unfavorite: ["item_id"],
  create_pickup: [
    "request_type",
    "category",
    "subcategory_hint",
    "address",
    "service_area_id",
    "pickup_slot_id",
    "item_count",
    "brands",
    "estimated_value",
    "home_type",
    "home_maker",
    "home_age",
    "home_dimensions",
    "home_damage",
    "home_mark",
  ],
  confirm_pickup: ["request_id"],
  cancel_pickup: ["request_id"],
  unsold_preference: ["item_id", "preference"],
  cancel_checkout: ["order_id"],
  request_return: ["order_id", "order_item_id", "reason", "details"],
  change_username: ["username"],
  mark_alerts_read: [],
} as const;
export type AssistantOperationName = keyof typeof ASSISTANT_OPERATIONS;
export function sanitizeOperation(value: unknown): AssistantOperation | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.name !== "string" ||
    !Object.hasOwn(ASSISTANT_OPERATIONS, row.name)
  )
    return null;
  const allowed = ASSISTANT_OPERATIONS[
    row.name as AssistantOperationName
  ] as readonly string[];
  const fields: Record<string, string> = {};
  if (row.fields && typeof row.fields === "object")
    for (const [key, entry] of Object.entries(row.fields)) {
      if (
        allowed.includes(key) &&
        (typeof entry === "string" || typeof entry === "number")
      )
        fields[key] = String(entry).slice(0, 2000);
    }
  return {
    name: row.name,
    fields,
    summary:
      typeof row.summary === "string" ? row.summary.slice(0, 2000) : row.name,
  };
}
