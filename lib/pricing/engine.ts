import type { CommissionTier } from "../business-rules";

export const PRICING_ENGINE_VERSION = "sold-median-v1";
export type PricingRules = {
  maxAgeDays: number | null;
  minSoldComparables: number | null;
  minSimilarityBps: number | null;
  processingCents: number | null;
  storageCents: number | null;
  paymentFixedCents: number | null;
  paymentBps: number | null;
  minimumProfitCents: number | null;
  reviewDays: number[];
};
export type Comparable = {
  id: string;
  source: string;
  url: string;
  priceCents: number;
  currency: string;
  observedAt: string;
  priceType: "listed" | "sold";
  brand: string;
  category: string;
  model: string | null;
  condition: string;
  similarityBps: number;
  evidence: string;
};
export type PricingInput = {
  item: {
    brand: string | null;
    category: string;
    item_condition: string | null;
    locked_seller_commission_bps: number | null;
  };
  comparables: Comparable[];
  rules: PricingRules;
  sellingRules: {
    commissionTiers: CommissionTier[];
    minimumSellingPriceCents: number;
    minimumIndividualItemValueCents: number;
  };
  observedAt: string;
};
export type Economics = {
  sellerCents: number | null;
  platformRevenueCents: number | null;
  costCents: number | null;
  profitCents: number | null;
  uneconomic: boolean | null;
};

const validMoney = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  Number(value) >= 0 &&
  Number(value) <= 100_000_000;
const normalize = (value: string | null) => (value ?? "").trim().toLowerCase();

export function estimateEconomics(
  price: number,
  input: PricingInput,
): Economics {
  if (!validMoney(price)) throw new Error("Invalid CAD cents");
  const tiers = input.sellingRules.commissionTiers;
  const matches = tiers.filter(
    (t) => price >= t.minCents && (t.maxCents === null || price <= t.maxCents),
  );
  const tier = matches.length === 1 ? matches[0] : null;
  const locked = input.item.locked_seller_commission_bps;
  const bps =
    locked ??
    (tier && tier.sellerBps + tier.platformBps === 10000
      ? tier.sellerBps
      : null);
  const sellerCents =
    bps !== null && Number.isInteger(bps) && bps >= 0 && bps <= 10000
      ? Math.round((price * bps) / 10000)
      : null;
  const platformRevenueCents =
    sellerCents === null ? null : price - sellerCents;
  const r = input.rules;
  const costsReady =
    [
      r.processingCents,
      r.storageCents,
      r.paymentFixedCents,
      r.minimumProfitCents,
    ].every(validMoney) &&
    r.paymentBps !== null &&
    Number.isInteger(r.paymentBps) &&
    r.paymentBps >= 0 &&
    r.paymentBps <= 10000;
  const costCents = costsReady
    ? r.processingCents! +
      r.storageCents! +
      r.paymentFixedCents! +
      Math.round((price * r.paymentBps!) / 10000)
    : null;
  const profitCents =
    platformRevenueCents !== null && costCents !== null
      ? platformRevenueCents - costCents
      : null;
  return {
    sellerCents,
    platformRevenueCents,
    costCents,
    profitCents,
    uneconomic:
      profitCents === null ? null : profitCents < r.minimumProfitCents!,
  };
}

function quantile(values: number[], fraction: number) {
  const at = (values.length - 1) * fraction;
  const low = Math.floor(at);
  return Math.round(
    values[low] + (values[Math.ceil(at)] - values[low]) * (at - low),
  );
}

/** Evidence-only baseline. Listed prices never become sales, and unknown factors stay unknown. */
export function analyzePricing(input: PricingInput) {
  const r = input.rules;
  const now = Date.parse(input.observedAt);
  if (!Number.isFinite(now)) throw new Error("Invalid analysis timestamp");
  const configured =
    Number.isInteger(r.maxAgeDays) &&
    r.maxAgeDays! >= 1 &&
    r.maxAgeDays! <= 730 &&
    Number.isInteger(r.minSoldComparables) &&
    r.minSoldComparables! >= 3 &&
    r.minSoldComparables! <= 100 &&
    Number.isInteger(r.minSimilarityBps) &&
    r.minSimilarityBps! >= 1 &&
    r.minSimilarityBps! <= 10000;
  const excluded: { id: string; reason: string }[] = [];
  const accepted: Comparable[] = [];
  const seen = new Set<string>();
  for (const c of input.comparables) {
    const observed = Date.parse(c.observedAt);
    let reason: string | null = null;
    let url: URL | null = null;
    try {
      url = new URL(c.url);
    } catch {
      /* Invalid evidence is excluded below. */
    }
    const identity = url
      ? `${url.origin}${url.pathname.replace(/\/$/, "")}`
      : c.url;
    if (
      !validMoney(c.priceCents) ||
      c.priceCents === 0 ||
      c.currency !== "CAD" ||
      !["sold", "listed"].includes(c.priceType) ||
      !url ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !c.evidence?.trim() ||
      !c.source?.trim()
    )
      reason = "invalid_evidence";
    else if (!Number.isFinite(observed) || observed > now)
      reason = "invalid_date";
    else if (!configured) reason = "eligibility_rules_not_configured";
    else if (now - observed > r.maxAgeDays! * 86400000) reason = "stale";
    else if (
      !normalize(input.item.brand) ||
      normalize(c.brand) !== normalize(input.item.brand) ||
      normalize(c.category) !== normalize(input.item.category) ||
      !normalize(input.item.item_condition) ||
      normalize(c.condition) !== normalize(input.item.item_condition) ||
      !Number.isInteger(c.similarityBps) ||
      c.similarityBps < r.minSimilarityBps! ||
      c.similarityBps > 10000
    )
      reason = "not_comparable";
    else if (seen.has(identity)) reason = "duplicate_source_listing";
    if (reason) excluded.push({ id: c.id, reason });
    else {
      seen.add(identity);
      accepted.push(c);
    }
  }
  const sold = accepted
    .filter((c) => c.priceType === "sold")
    .map((c) => c.priceCents)
    .sort((a, b) => a - b);
  const listed = accepted
    .filter((c) => c.priceType === "listed")
    .map((c) => c.priceCents)
    .sort((a, b) => a - b);
  const range = (values: number[]) =>
    values.length
      ? {
          lowCents: quantile(values, 0.25),
          highCents: quantile(values, 0.75),
          count: values.length,
        }
      : null;
  const marketRange = range(sold);
  const enough = configured && sold.length >= r.minSoldComparables!;
  const referenceCents = enough ? quantile(sold, 0.5) : null;
  const floor = Math.max(
    800,
    input.sellingRules.minimumSellingPriceCents,
    input.sellingRules.minimumIndividualItemValueCents,
  );
  if (!validMoney(floor)) throw new Error("Invalid minimum selling price");
  const proposed =
    referenceCents === null ? null : Math.max(floor, referenceCents);
  const economics =
    proposed === null ? null : estimateEconomics(proposed, input);
  const suggestedCents = economics?.sellerCents === null ? null : proposed;
  const warnings: string[] = [];
  if (!configured)
    warnings.push(
      "Configure evidence eligibility before requesting a recommendation.",
    );
  if (!enough)
    warnings.push(
      "Insufficient recent, comparable sold evidence. Manual pricing is available.",
    );
  if (listed.length)
    warnings.push("Listed prices are asking prices, not completed sales.");
  if (referenceCents !== null && referenceCents < floor)
    warnings.push(
      "Market evidence is below the minimum selling price; consider rejecting or bundling this item.",
    );
  if (economics?.sellerCents === null)
    warnings.push(
      "No unambiguous commission tier applies. Review selling rules.",
    );
  if (economics?.profitCents == null)
    warnings.push(
      "Profit is unknown until processing, storage, payment fees and minimum profit are configured.",
    );
  if (economics?.uneconomic)
    warnings.push("Expected platform profit is below the configured minimum.");
  return {
    engineVersion: PRICING_ENGINE_VERSION,
    suggestedCents,
    referenceCents,
    marketRange,
    listedRange: range(listed),
    economics,
    // Coverage measures eligible evidence, not a calibrated probability of a sale.
    confidence: enough ? ("limited" as const) : ("insufficient" as const),
    confidenceScore: null,
    evidenceCoverageBps: configured
      ? Math.min(
          10000,
          Math.round((sold.length / r.minSoldComparables!) * 10000),
        )
      : 0,
    reasons: [
      "Median of eligible CAD sold comparables; interquartile evidence range.",
      "Brand, category and inspected condition must match; similarity and freshness use the saved rule version.",
      "No calibrated demand, season, size or time-to-sale adjustment is available yet.",
    ],
    warnings,
    includedIds: accepted.map((c) => c.id),
    excluded,
  };
}
