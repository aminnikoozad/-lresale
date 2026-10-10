import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { accountNavigation, adminNavigation, isWorkspaceLinkActive } from "../lib/workspace-navigation.ts";
import { safeRedirectPath } from "../lib/safe-redirect.ts";

const hrefs = (access: Parameters<typeof adminNavigation>[0]) => adminNavigation(access).map((entry) => entry.href);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("missing or denied capabilities never advertise privileged destinations", () => {
  assert.deepEqual(hrefs({ has_aal2: true }), ["/admin", "/admin/readiness", "/admin/security"]);
  for (const href of ["/admin/items", "/admin/processing", "/admin/orders", "/admin/settings", "/admin/support", "/admin/ai-trainer"]) {
    assert.equal(hrefs({ can_manage_items: false, can_support: false, ai_view: false }).includes(href), false);
  }
});

test("staff menus respect independent inventory, shipping, pickup and support capabilities", () => {
  assert.ok(hrefs({ can_manage_items: true }).includes("/admin/processing"));
  assert.equal(hrefs({ can_manage_items: true }).includes("/admin/orders"), false);
  assert.ok(hrefs({ can_manage_shipping: true }).includes("/admin/operations"));
  assert.equal(hrefs({ can_manage_shipping: true }).includes("/admin/operations#pickup-requests"), false);
  assert.ok(hrefs({ can_manage_pickups: true }).includes("/admin/operations#pickup-requests"));
  assert.equal(hrefs({ can_support: true }).includes("/admin/ai-trainer"), false);
  assert.ok(hrefs({ ai_view: true }).includes("/admin/ai-trainer"));
  assert.ok(hrefs({ can_manage_selling_rules: true }).includes("/admin/pilot"));
});

test("all account and admin destinations resolve to real routes", () => {
  const links = [...accountNavigation, ...adminNavigation({ can_manage_items: true, can_manage_pickups: true, can_manage_shipping: true, can_manage_selling_rules: true, can_support: true, ai_view: true })];
  for (const link of links) assert.ok(existsSync(new URL(`../app${link.href.split("#")[0]}/page.tsx`, import.meta.url)), link.href);
});

test("active menu highlights only the most specific matching route", () => {
  const links = adminNavigation({ can_support: true });
  assert.equal(isWorkspaceLinkActive("/admin/support/settings", "/admin", links), false);
  assert.equal(isWorkspaceLinkActive("/admin/support/settings", "/admin/support", links), false);
  assert.equal(isWorkspaceLinkActive("/admin/support/settings", "/admin/support/settings", links), true);
  assert.equal(isWorkspaceLinkActive("/accounting", "/account", accountNavigation), false);
});

test("login returns only to safe local checkout/item/account destinations", () => {
  for (const next of ["/checkout", "/item/abc", "/account/purchases?tab=saved#items"]) assert.equal(safeRedirectPath(next, "https://rewear.invalid"), next);
  for (const next of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/\nevil.test"]) assert.equal(safeRedirectPath(next, "https://rewear.invalid"), "/account");
});

test("MFA step-up stays reachable while page/action authorization remains in place", () => {
  const mfa = read("../app/admin/mfa/page.tsx");
  assert.match(mfa, /requireAdmin\(\{ requireMfa: false \}\)/);
  assert.match(mfa, /if \(access\.has_aal2\) redirect/);
  assert.doesNotMatch(mfa, /!access\.require_mfa \|\|/);
  assert.match(read("../app/admin/orders/page.tsx"), /!access\.has_aal2/);
  assert.match(read("../app/admin/processing/page.tsx"), /permission\.data !== true/);
  assert.match(read("../app/admin/layout.tsx"), /requireAdmin\(\{ requireMfa: false \}\)/);
});

test("buyer failures, unavailable links and duplicate-submit protection are explicit", () => {
  const buyer = read("../components/buyer-account-tools.tsx");
  assert.match(buyer, /loadError \?/);
  assert.match(buyer, /catalogMap\.has\(item\.item_id\) \?/);
  assert.match(buyer, /catalogMap\.has\(alert\.item_id\) \?/);
  assert.match(read("../components/pending-submit-button.tsx"), /disabled=\{disabled \|\| pending\}/);
  assert.match(read("../app/admin/mfa/mfa-client.tsx"), /if \(verificationPending\.current\) return/);
  assert.match(read("../app/login/page.tsx"), /name="next" value=\{next\}/);
  assert.match(read("../app/auth/actions.ts"), /protectAuthForm\(formData, "\/login", next\)/);
});
