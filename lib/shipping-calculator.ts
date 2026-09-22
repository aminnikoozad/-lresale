export type ShippingRateInput = {
  subtotalCents: number;
  weightKg: number;
  province: string;
};

export type ShippingRateConfig = {
  baseFeeCents: number;
  perKgCents: number;
  freeShippingThresholdCents: number | null;
  remoteSurchargeCents: number;
  remoteProvinces: string[];
};

export function calculateShippingCents(input: ShippingRateInput, config: ShippingRateConfig) {
  const subtotal = Math.max(0, Math.round(input.subtotalCents));
  const weightKg = Number(input.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 100) {
    throw new RangeError("Shipping weight must be between 0 and 100 kg.");
  }
  if (config.freeShippingThresholdCents !== null && subtotal >= config.freeShippingThresholdCents) return 0;
  const province = input.province.trim().toUpperCase();
  const remote = config.remoteProvinces.map((value) => value.toUpperCase()).includes(province);
  return Math.max(0, config.baseFeeCents + Math.ceil(weightKg) * config.perKgCents + (remote ? config.remoteSurchargeCents : 0));
}
