import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkoutLoginHref, reservationTime } from "../lib/buyer-flow-navigation.ts";
import { safeRedirectPath } from "../lib/safe-redirect.ts";

test("login returns to the same checkout items through the actual redirect sanitizer", () => {
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  const login = new URL(checkoutLoginHref(ids), "https://shikimomo.com");
  assert.equal(login.pathname, "/login");
  const next = safeRedirectPath(login.searchParams.get("next"), "https://shikimomo.invalid");
  const checkout = new URL(next, "https://shikimomo.com");
  assert.equal(checkout.pathname, "/checkout");
  assert.deepEqual(checkout.searchParams.get("items")?.split(","), ids);
});

test("awaiting-payment reservation time renders without an Intl option exception", () => {
  const value = reservationTime("2026-10-17T14:30:00.000Z");
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0);
});

test("checkout and purchase components use the regression-tested helpers", () => {
  const checkout = readFileSync(new URL("../app/checkout/checkout-client.tsx", import.meta.url), "utf8");
  const purchases = readFileSync(new URL("../components/buyer-account-tools.tsx", import.meta.url), "utf8");
  assert.match(checkout, /router\.push\(checkoutLoginHref\(itemIds\)\)/);
  assert.match(purchases, /reservationTime\(order\.reservation_expires_at\)/);
  assert.doesNotMatch(checkout, /router\.push\("\/login\?next=%2Fcheckout"\)/);
  assert.doesNotMatch(purchases, /timeStyle: "short", timeZoneName: "short"/);
});

test("guest support copy points to the available unsigned-in contact route", () => {
  const source = readFileSync(new URL("../components/support-hub.tsx", import.meta.url), "utf8");
  assert.match(source, /href="\/contact"/);
  assert.match(source, /Create a ticket without signing in/);
  assert.match(source, /Sign in to track your ticket and read our replies, or contact us without an account/);
  assert.doesNotMatch(source, /a direct support contact is needed/);
});

test("legal titles rely on the layout to append the Shikimomo brand once", () => {
  for (const route of ["terms", "returns", "privacy", "seller-terms", "shipping-policy", "pickup-policy"]) {
    const source = readFileSync(new URL(`../app/${route}/page.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /title: "[^"\n]+ \| Shikimomo"/, route);
  }
});
