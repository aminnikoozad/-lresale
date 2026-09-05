export const MIN_INDIVIDUAL_LISTING_PRICE_CENTS = 2_000;
export const MAX_ITEM_PRICE_CENTS = 100_000_000;

export type CommissionTier = {
  sellerBps: 4500 | 5000 | 5500 | 6500;
  platformBps: 5500 | 5000 | 4500 | 3500;
};

export function commissionTierForInitialPrice(initialPriceCents: number): CommissionTier {
  if (!Number.isInteger(initialPriceCents) || initialPriceCents < MIN_INDIVIDUAL_LISTING_PRICE_CENTS || initialPriceCents > MAX_ITEM_PRICE_CENTS) {
    throw new RangeError("Initial listing price must be between $20 and $1,000,000.");
  }
  if (initialPriceCents < 10_000) return { sellerBps: 4500, platformBps: 5500 };
  if (initialPriceCents < 25_000) return { sellerBps: 5000, platformBps: 5000 };
  if (initialPriceCents < 50_000) return { sellerBps: 5500, platformBps: 4500 };
  return { sellerBps: 6500, platformBps: 3500 };
}

export function earningsFromSalePrice(salePriceCents: number, sellerBps: number) {
  if (!Number.isInteger(salePriceCents) || salePriceCents < 0 || !Number.isInteger(sellerBps) || sellerBps < 0 || sellerBps > 10_000) {
    throw new RangeError("Invalid sale price or commission rate.");
  }
  const sellerEarningsCents = Math.round((salePriceCents * sellerBps) / 10_000);
  return { sellerEarningsCents, platformEarningsCents: salePriceCents - sellerEarningsCents };
}

export function commissionPercent(bps: number) {
  return `${bps / 100}%`;
}
