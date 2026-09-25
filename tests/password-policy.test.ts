import test from "node:test";
import assert from "node:assert/strict";
import { passwordPolicyError } from "../lib/password-policy.ts";

test("requires uppercase, lowercase, number and symbol with at least eight characters", () => {
  for (const weak of [
    "sho1!A",
    "alllower1!",
    "ALLUPPER1!",
    "NoNumber!",
    "NoSymbol1",
    "Has Space1 ",
  ]) {
    assert.equal(typeof passwordPolicyError(weak), "string", weak);
  }

  assert.equal(passwordPolicyError("Strong1!"), null);
  assert.equal(passwordPolicyError("Another?9Good"), null);
});
