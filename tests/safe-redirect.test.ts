import test from "node:test";
import assert from "node:assert/strict";
import { safeRedirectPath } from "../lib/safe-redirect.ts";

const origin = "https://lresale.vercel.app";

test("allows normal local paths and preserves query/hash", () => {
  assert.equal(safeRedirectPath("/account", origin), "/account");
  assert.equal(
    safeRedirectPath("/account?tab=wallet#balance", origin),
    "/account?tab=wallet#balance",
  );
});

test("rejects protocol-relative and absolute external redirects", () => {
  assert.equal(safeRedirectPath("//evil.example", origin), "/account");
  assert.equal(safeRedirectPath("https://evil.example/phish", origin), "/account");
  assert.equal(safeRedirectPath("javascript:alert(1)", origin), "/account");
});

test("rejects backslash URL normalization tricks", () => {
  assert.equal(safeRedirectPath("/\\evil.example", origin), "/account");
  assert.equal(safeRedirectPath("/\\\\evil.example/path", origin), "/account");
});

test("rejects control characters and invalid values", () => {
  assert.equal(safeRedirectPath("/account\u0000evil", origin), "/account");
  assert.equal(safeRedirectPath(null, origin), "/account");
});

test("uses the supplied local fallback", () => {
  assert.equal(safeRedirectPath("//evil.example", origin, "/login"), "/login");
});
