import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePricing,
  estimateEconomics,
  type PricingInput,
  type Comparable,
} from "../lib/pricing/engine.ts";
import { validateRecognition } from "../lib/pricing/recognition.ts";
import { DEFAULT_SELLING_RULES } from "../lib/business-rules.ts";
const base: PricingInput = {
  item: {
    brand: "Brand",
    category: "women",
    item_condition: "Good",
    locked_seller_commission_bps: null,
  },
  rules: {
    maxAgeDays: 90,
    minSoldComparables: 3,
    minSimilarityBps: 8000,
    processingCents: 300,
    storageCents: 100,
    paymentFixedCents: 30,
    paymentBps: 290,
    minimumProfitCents: 100,
    reviewDays: [30, 60, 90],
  },
  sellingRules: DEFAULT_SELLING_RULES,
  comparables: [],
  observedAt: "2026-10-20T12:00:00Z",
};
const comp = (n: number, price = 2000): Comparable => ({
  id: String(n),
  source: "Authorized test fixture",
  url: `https://example.test/sales/${n}`,
  priceCents: price,
  currency: "CAD",
  observedAt: "2026-10-19T12:00:00Z",
  priceType: "sold",
  brand: "Brand",
  category: "women",
  model: null,
  condition: "Good",
  similarityBps: 9000,
  evidence: "Synthetic test fixture, never production data",
});
test("sold median and quartiles are explainable; listed prices never drive a sale recommendation", () => {
  const r = analyzePricing({
    ...base,
    comparables: [
      comp(1, 1000),
      comp(2, 2000),
      comp(3, 3000),
      { ...comp(4, 100000), priceType: "listed" },
    ],
  });
  assert.equal(r.suggestedCents, 2000);
  assert.deepEqual(r.marketRange, {
    lowCents: 1500,
    highCents: 2500,
    count: 3,
  });
  assert.equal(r.listedRange?.lowCents, 100000);
  assert.equal(r.confidenceScore, null);
  assert.equal(
    analyzePricing({
      ...base,
      comparables: [1, 2, 3].map((n) => ({ ...comp(n), priceType: "listed" })),
    }).suggestedCents,
    null,
  );
});
test("stale, future, foreign currency, mismatched, unauthorized, duplicate and invalid evidence is excluded", () => {
  const variants = [
    { ...comp(1), observedAt: "2020-01-01" },
    { ...comp(2), observedAt: "2027-01-01" },
    { ...comp(3), currency: "USD" },
    { ...comp(4), brand: "Other" },
    { ...comp(5), condition: "New" },
    { ...comp(6), evidence: "" },
    { ...comp(7), url: "javascript:alert(1)" },
    { ...comp(8), priceCents: NaN },
    { ...comp(9), similarityBps: 10001 },
    comp(10),
    { ...comp(11), url: comp(10).url + "?tracking=2" },
  ];
  const r = analyzePricing({ ...base, comparables: variants });
  assert.equal(r.includedIds.length, 1);
  assert.equal(r.excluded.length, 10);
  assert.equal(r.suggestedCents, null);
});
test("unknown costs and unconfigured evidence rules remain unknown", () => {
  const input = {
    ...base,
    rules: { ...base.rules, processingCents: null },
    comparables: [comp(1), comp(2), comp(3)],
  };
  assert.equal(analyzePricing(input).economics?.profitCents, null);
  assert.equal(
    analyzePricing({
      ...input,
      rules: { ...input.rules, minSoldComparables: null },
    }).suggestedCents,
    null,
  );
});
test("CAD 8 floor, tier boundaries, rounded cents and locked commission survive repricing", () => {
  const r = analyzePricing({
    ...base,
    comparables: [comp(1, 500), comp(2, 600), comp(3, 700)],
  });
  assert.equal(r.suggestedCents, 800);
  assert.equal(r.referenceCents, 600);
  assert.equal(r.economics?.uneconomic, true);
  assert.equal(estimateEconomics(9999, base).sellerCents, 4500);
  assert.equal(estimateEconomics(10000, base).sellerCents, 5000);
  assert.equal(
    estimateEconomics(10000, {
      ...base,
      item: { ...base.item, locked_seller_commission_bps: 4500 },
    }).sellerCents,
    4500,
  );
  assert.deepEqual(estimateEconomics(2000, base), {
    sellerCents: 900,
    platformRevenueCents: 1100,
    costCents: 488,
    profitCents: 612,
    uneconomic: false,
  });
  assert.equal(DEFAULT_SELLING_RULES.minimumPickupEstimatedValueCents, 6000);
});
test("incorrect AI output cannot set an inspected condition or price", () => {
  assert.throws(() =>
    validateRecognition({
      brand: "x",
      confidenceBps: 15000,
      visibleDefects: [],
    }),
  );
  const r = validateRecognition({
    brand: "Wrong brand",
    category: "women",
    garmentType: null,
    color: null,
    material: null,
    sizeLabel: "M",
    suggestedCondition: "New",
    visibleDefects: [],
    confidenceBps: 9000,
    inspected_at: "fake",
    price: 10000,
  });
  assert.equal("price" in r, false);
  assert.equal("inspected_at" in r, false);
  assert.equal(r.suggestedCondition, "New");
});
test("bounded comparable processing works across thousands of items without remote calls", () => {
  const input = {
    ...base,
    comparables: Array.from({ length: 500 }, (_, n) => comp(n, 1000 + n)),
  };
  for (let n = 0; n < 2000; n++)
    assert.equal(analyzePricing(input).suggestedCents, 1250);
});
