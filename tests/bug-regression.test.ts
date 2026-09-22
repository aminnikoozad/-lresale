import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = [
  "../app/admin/operations/actions.ts",
  "../app/admin/settings/actions.ts",
  "../app/admin/security/actions.ts",
  "../app/auth/actions.ts",
];

test("server actions do not contain common accidental secret exposure patterns", async () => {
  for (const relative of files) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /NEXT_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET|PRIVATE)/i, relative);
    assert.doesNotMatch(source, /console\.(log|error)\([^\n]*(password|access_token|refresh_token)/i, relative);
  }
});

test("admin mutation actions authenticate through requireAdmin", async () => {
  for (const relative of ["../app/admin/operations/actions.ts", "../app/admin/security/actions.ts"]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /requireAdmin\(/, relative);
  }
});

test("shipping mutation has numeric validation before database write", async () => {
  const source = await readFile(new URL("../app/admin/operations/actions.ts", import.meta.url), "utf8");
  assert.match(source, /Number\.isFinite\(radiusKm\)/);
  assert.match(source, /flatFeeCents/);
});
