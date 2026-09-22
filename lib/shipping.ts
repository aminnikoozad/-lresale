export type ShippingQuote = {
  status: "ok" | "local_free" | "local_only" | "unavailable" | "invalid_postal" | "invalid_items" | "unavailable_items" | "configuration_error";
  shippingCents?: number;
  packageCount?: number;
  ruleVersion?: number;
  calculationVersion?: string;
  quoteId?: string;
  expiresInSeconds?: number;
};

export function normalizeCanadianPostal(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isCanadianPostal(value: string) {
  return /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ]\d[ABCEGHJKLMNPRSTVWXYZ]\d$/.test(normalizeCanadianPostal(value));
}

export function shippingMessage(quote: ShippingQuote) {
  if (quote.status === "local_free") return "Free local delivery";
  if (quote.status === "local_only") return "This item is available for local delivery only.";
  if (quote.status === "unavailable") return "Shipping is currently unavailable to this postal code.";
  if (quote.status === "invalid_postal") return "Enter a valid Canadian postal code.";
  if (quote.status === "unavailable_items") return "One or more items are no longer available.";
  if (quote.status === "configuration_error") return "We couldn’t calculate shipping right now. Please try again.";
  if (quote.status === "ok" && Number.isInteger(quote.shippingCents)) return `Shipping: $${(quote.shippingCents! / 100).toFixed(2)}`;
  return "Shipping could not be calculated.";
}
