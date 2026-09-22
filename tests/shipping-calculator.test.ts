import test from "node:test";
import assert from "node:assert/strict";
import { calculateShippingCents } from "../lib/shipping-calculator.ts";

const config = {
  baseFeeCents: 900,
  perKgCents: 250,
  freeShippingThresholdCents: 15000,
  remoteSurchargeCents: 700,
  remoteProvinces: ["YT", "NT", "NU"],
};

test("shipping calculator rounds weight up and applies configured rate", () => {
  assert.equal(calculateShippingCents({ subtotalCents: 5000, weightKg: 1.2, province: "ON" }, config), 1400);
});

test("shipping calculator applies remote surcharge", () => {
  assert.equal(calculateShippingCents({ subtotalCents: 5000, weightKg: 1, province: "YT" }, config), 1850);
});

test("shipping calculator honors free-shipping threshold", () => {
  assert.equal(calculateShippingCents({ subtotalCents: 15000, weightKg: 4, province: "BC" }, config), 0);
});

test("shipping calculator rejects unsafe weights", () => {
  assert.throws(() => calculateShippingCents({ subtotalCents: 1000, weightKg: 0, province: "ON" }, config), RangeError);
});
