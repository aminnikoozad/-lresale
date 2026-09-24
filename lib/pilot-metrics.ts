export const PILOT_TARGETS = {
  startDate: "2026-09-24",
  maxLiveItems: 30,
  durationWeeks: 8,
  acceptedItems: 150,
  listedItems: 100,
  sellThroughBps: 5_000,
  averageSalePriceCents: 3_000,
  realSellers: 15,
  processingMinutesPerItem: 10,
  repeatSellerRateBps: 2_000,
  maxUnsoldOlderThan60DaysBps: 5_000,
} as const;

export type PilotSnapshot = {
  start_date: string;
  end_date: string;
  accepted_items: number;
  listed_items: number;
  sold_items: number;
  active_listed_items: number;
  real_sellers: number;
  repeat_sellers: number;
  gross_sales_cents: number;
  platform_commission_cents: number;
  operating_costs_cents: number;
  labor_cost_cents: number;
  labor_minutes: number;
  contribution_cents: number;
  average_sale_price_cents: number;
  sell_through_bps: number;
  repeat_seller_rate_bps: number;
  unsold_older_60_days: number;
  unsold_older_60_days_bps: number;
};

export type PilotSignal = "met" | "watch" | "not-yet";

export function pilotSignal(value: number, target: number, higherIsBetter = true): PilotSignal {
  if (higherIsBetter) {
    if (value >= target) return "met";
    if (value >= target * 0.7) return "watch";
    return "not-yet";
  }
  if (value <= target) return "met";
  if (value <= target * 1.3) return "watch";
  return "not-yet";
}

export function formatCad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatPercent(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
