import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("production source does not include a demo account route", () => {
  const demoRoute = path.join(root, "app", "demo-account", "page.tsx");
  assert.equal(fs.existsSync(demoRoute), false);
});

test("CSP blocks inline script event-handler attributes", () => {
  const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
  assert.match(nextConfig, /script-src-attr 'none'/);
});
