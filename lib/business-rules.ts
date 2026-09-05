import type { SupabaseClient } from "@supabase/supabase-js";

export type CommissionTier = {
  minCents: number;
  maxCents: number | null;
  sellerBps: number;
  platformBps: number;
};

export type SellingRules = {
  minimumIndividualItemValueCents: number;
  minimumPickupEstimatedValueCents: number;
  commissionTiers: CommissionTier[];
  bundleEligibility: boolean;
  sellingPeriodDays: number;
  discountSchedule: Array<{ startDay: number; discountBps: number }>;
  minimumSellingPriceCents: number;
  pickupRules: {
    confirmationRequired: boolean;
    firstMissedPickupFeeCents: number;
    secondMissedPickupFeeCents: number;
    suspendFreePickupAfterMisses: number;
    freePickupThresholdCents: number;
    lowValuePickupItemFeeCents: number;
    bagMinimumEstimatedValueCents: number;
    priorityPickupAtOrAboveThreshold: boolean;
  };
  storeCreditBonusBps: number;
  returnPeriodDays: number | null;
  highValueThresholdCents: number;
};

export const DEFAULT_SELLING_RULES: SellingRules = {
  minimumIndividualItemValueCents: 2_000,
  minimumPickupEstimatedValueCents: 1,
  commissionTiers: [
    { minCents: 2_000, maxCents: 9_999, sellerBps: 4_500, platformBps: 5_500 },
    { minCents: 10_000, maxCents: 24_999, sellerBps: 5_000, platformBps: 5_000 },
    { minCents: 25_000, maxCents: 49_999, sellerBps: 5_500, platformBps: 4_500 },
    { minCents: 50_000, maxCents: null, sellerBps: 6_500, platformBps: 3_500 },
  ],
  bundleEligibility: true,
  sellingPeriodDays: 90,
  discountSchedule: [],
  minimumSellingPriceCents: 2_000,
  pickupRules: {
    confirmationRequired: true,
    firstMissedPickupFeeCents: 0,
    secondMissedPickupFeeCents: 1_000,
    suspendFreePickupAfterMisses: 3,
    freePickupThresholdCents: 10_000,
    lowValuePickupItemFeeCents: 500,
    bagMinimumEstimatedValueCents: 10_000,
    priorityPickupAtOrAboveThreshold: true,
  },
  storeCreditBonusBps: 0,
  returnPeriodDays: null,
  highValueThresholdCents: 50_000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, fallback: number) {
  return Number.isInteger(value) ? Number(value) : fallback;
}

export function normalizeSellingRules(value: unknown): SellingRules {
  if (!isRecord(value)) return DEFAULT_SELLING_RULES;

  const tiers = Array.isArray(value.commissionTiers)
    ? value.commissionTiers
        .filter(isRecord)
        .map((tier) => ({
          minCents: integer(tier.minCents, -1),
          maxCents: tier.maxCents === null ? null : integer(tier.maxCents, -1),
          sellerBps: integer(tier.sellerBps, -1),
          platformBps: integer(tier.platformBps, -1),
        }))
        .filter(
          (tier) =>
            tier.minCents >= 0 &&
            (tier.maxCents === null || tier.maxCents >= tier.minCents) &&
            tier.sellerBps >= 0 &&
            tier.platformBps >= 0 &&
            tier.sellerBps + tier.platformBps === 10_000,
        )
    : [];

  const pickup = isRecord(value.pickupRules) ? value.pickupRules : {};
  const discountSchedule = Array.isArray(value.discountSchedule)
    ? value.discountSchedule
        .filter(isRecord)
        .map((entry) => ({
          startDay: integer(entry.startDay, -1),
          discountBps: integer(entry.discountBps, -1),
        }))
        .filter((entry) => entry.startDay >= 1 && entry.discountBps >= 0 && entry.discountBps <= 10_000)
    : [];

  return {
    minimumIndividualItemValueCents: integer(
      value.minimumIndividualItemValueCents,
      DEFAULT_SELLING_RULES.minimumIndividualItemValueCents,
    ),
    minimumPickupEstimatedValueCents: integer(
      value.minimumPickupEstimatedValueCents,
      DEFAULT_SELLING_RULES.minimumPickupEstimatedValueCents,
    ),
    commissionTiers: tiers.length ? tiers.sort((a, b) => a.minCents - b.minCents) : DEFAULT_SELLING_RULES.commissionTiers,
    bundleEligibility:
      typeof value.bundleEligibility === "boolean"
        ? value.bundleEligibility
        : DEFAULT_SELLING_RULES.bundleEligibility,
    sellingPeriodDays: integer(value.sellingPeriodDays, DEFAULT_SELLING_RULES.sellingPeriodDays),
    discountSchedule,
    minimumSellingPriceCents: integer(
      value.minimumSellingPriceCents,
      DEFAULT_SELLING_RULES.minimumSellingPriceCents,
    ),
    pickupRules: {
      confirmationRequired:
        typeof pickup.confirmationRequired === "boolean"
          ? pickup.confirmationRequired
          : DEFAULT_SELLING_RULES.pickupRules.confirmationRequired,
      firstMissedPickupFeeCents: integer(
        pickup.firstMissedPickupFeeCents,
        DEFAULT_SELLING_RULES.pickupRules.firstMissedPickupFeeCents,
      ),
      secondMissedPickupFeeCents: integer(
        pickup.secondMissedPickupFeeCents,
        DEFAULT_SELLING_RULES.pickupRules.secondMissedPickupFeeCents,
      ),
      suspendFreePickupAfterMisses: integer(
        pickup.suspendFreePickupAfterMisses,
        DEFAULT_SELLING_RULES.pickupRules.suspendFreePickupAfterMisses,
      ),
      freePickupThresholdCents: integer(
        pickup.freePickupThresholdCents,
        DEFAULT_SELLING_RULES.pickupRules.freePickupThresholdCents,
      ),
      lowValuePickupItemFeeCents: integer(
        pickup.lowValuePickupItemFeeCents,
        DEFAULT_SELLING_RULES.pickupRules.lowValuePickupItemFeeCents,
      ),
      bagMinimumEstimatedValueCents: integer(
        pickup.bagMinimumEstimatedValueCents,
        DEFAULT_SELLING_RULES.pickupRules.bagMinimumEstimatedValueCents,
      ),
      priorityPickupAtOrAboveThreshold:
        typeof pickup.priorityPickupAtOrAboveThreshold === "boolean"
          ? pickup.priorityPickupAtOrAboveThreshold
          : DEFAULT_SELLING_RULES.pickupRules.priorityPickupAtOrAboveThreshold,
    },
    storeCreditBonusBps: integer(value.storeCreditBonusBps, DEFAULT_SELLING_RULES.storeCreditBonusBps),
    returnPeriodDays:
      value.returnPeriodDays === null
        ? null
        : integer(value.returnPeriodDays, DEFAULT_SELLING_RULES.returnPeriodDays ?? 0) || null,
    highValueThresholdCents: integer(
      value.highValueThresholdCents,
      DEFAULT_SELLING_RULES.highValueThresholdCents,
    ),
  };
}

export async function loadSellingRules(supabase: SupabaseClient): Promise<SellingRules> {
  try {
    const { data, error } = await supabase.rpc("get_selling_rules");
    if (error || !data) return DEFAULT_SELLING_RULES;
    return normalizeSellingRules(data);
  } catch {
    return DEFAULT_SELLING_RULES;
  }
}

export function commissionTierForInitialPrice(
  initialPriceCents: number,
  rules: SellingRules,
): CommissionTier {
  if (!Number.isInteger(initialPriceCents) || initialPriceCents < rules.minimumIndividualItemValueCents) {
    throw new RangeError("Initial listing price is below the configured minimum.");
  }

  const tier = rules.commissionTiers.find(
    (candidate) =>
      initialPriceCents >= candidate.minCents &&
      (candidate.maxCents === null || initialPriceCents <= candidate.maxCents),
  );
  if (!tier) throw new RangeError("No commission tier is configured for this price.");
  return tier;
}

export function formatCadFromCents(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function tierPriceLabel(tier: CommissionTier) {
  const minimum = formatCadFromCents(tier.minCents);
  if (tier.maxCents === null) return `${minimum}+`;
  return `${minimum}–${formatCadFromCents(tier.maxCents)}`;
}
