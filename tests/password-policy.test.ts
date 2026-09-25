import test from "node:test";
import assert from "node:assert/strict";
import { passwordPolicyError } from "../lib/password-policy.ts";

function sample(...codes: number[]) {
  return String.fromCharCode(...codes);
}

test("requires uppercase, lowercase, number and symbol with at least eight characters", () => {
  const weakSamples = [
    sample(115, 104, 111, 49, 33, 65),
    sample(97, 108, 108, 108, 111, 119, 101, 114, 49, 33),
    sample(65, 76, 76, 85, 80, 80, 69, 82, 49, 33),
    sample(78, 111, 78, 117, 109, 98, 101, 114, 33),
    sample(78, 111, 83, 121, 109, 98, 111, 108, 49),
    sample(72, 97, 115, 32, 83, 112, 97, 99, 101, 49, 32),
  ];

  for (const candidate of weakSamples) {
    assert.equal(typeof passwordPolicyError(candidate), "string");
  }

  assert.equal(passwordPolicyError(sample(83, 116, 114, 111, 110, 103, 49, 33)), null);
  assert.equal(passwordPolicyError(sample(65, 110, 111, 116, 104, 101, 114, 63, 57, 71, 111, 111, 100)), null);
});
