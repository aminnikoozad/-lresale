import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCanadianPostalCode, parcelWeightKg, weightClassFor } from "../lib/shipping.ts";

test("normalizes Canadian postal codes", () => {
  assert.equal(normalizeCanadianPostalCode("h3z 2y7"), "H3Z2Y7");
  assert.equal(normalizeCanadianPostalCode(" H2X-1Y4 "), "H2X1Y4");
});

test("maps the four REWEAR parcel weight classes at boundaries", () => {
  assert.equal(weightClassFor(0.5), "light");
  assert.equal(weightClassFor(0.51), "standard");
  assert.equal(weightClassFor(2), "standard");
  assert.equal(weightClassFor(2.01), "medium");
  assert.equal(weightClassFor(5), "medium");
  assert.equal(weightClassFor(5.01), "large");
  assert.equal(weightClassFor(30), "large");
});

test("uses category fallback weights plus packaging", () => {
  assert.equal(parcelWeightKg([{ category: "accessories" }]), 0.55);
  assert.equal(parcelWeightKg([{ category: "shoes" }]), 1.4);
});

test("uses inspected weight when supplied and caps parcel weight", () => {
  assert.equal(parcelWeightKg([{ category: "home_decor", weightKg: 4.25 }]), 4.45);
  assert.equal(parcelWeightKg([{ category: "home_decor", weightKg: 50 }]), 30);
});

test("rejects unusable client weights by falling back to category weight", () => {
  assert.equal(parcelWeightKg([{ category: "electronics", weightKg: -5 }]), 1.7);
  assert.equal(parcelWeightKg([{ category: "women", weightKg: Number.NaN }]), 0.8);
});
