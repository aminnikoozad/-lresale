import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const legalSql = await readFile(new URL("../supabase/migrations/20260925130000_checkout_legal_acceptance_foundation.sql", import.meta.url), "utf8");
const paymentSql = await readFile(new URL("../supabase/migrations/20260925131500_payment_idempotency_and_order_invariants.sql", import.meta.url), "utf8");
const supportAi = await readFile(new URL("../supabase/functions/support-ai/index.ts", import.meta.url), "utf8");
const checkoutClient = await readFile(new URL("../app/checkout/checkout-client.tsx", import.meta.url), "utf8");

test("prepared checkout records versioned policy acceptance server-side", () => {
  assert.match(legalSql, /buyer_terms_accepted_at/i);
  assert.match(legalSql, /where id = p_order and buyer_id = uid/i);
  assert.match(legalSql, /status <> 'awaiting_payment'/i);
  assert.match(legalSql, /reservation_expires_at <= now\(\)/i);
  assert.match(legalSql, /revoke all on function public\.accept_checkout_terms[\s\S]*from public, anon/i);
  assert.match(checkoutClient, /buyer_terms_accepted/);
  assert.match(checkoutClient, /prepare_checkout_with_terms/);
  assert.doesNotMatch(checkoutClient, /supabase\.rpc\("accept_checkout_terms"/);
  assert.match(checkoutClient, /BUYER_TERMS_VERSION/);
  assert.match(checkoutClient, /RETURN_POLICY_VERSION/);
});

test("cart and checkout progress describe unpaid order preparation", async () => {
  const cart = await readFile(new URL("../app/cart/page.tsx", import.meta.url), "utf8");
  const checkoutCss = await readFile(new URL("../app/checkout-readiness.css", import.meta.url), "utf8");
  assert.match(checkoutCss, /\.checkout-progress\{[^}]*grid-template-columns:repeat\(3,1fr\)/);
  for (const [source, expectedCount] of [[cart, 1], [checkoutClient, 2]] as const) {
    const file = ts.createSourceFile("checkout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const progress: ts.JsxElement[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attribute) =>
        ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "className" &&
        attribute.initializer && ts.isStringLiteral(attribute.initializer) &&
        attribute.initializer.text === "checkout-progress")) progress.push(node);
      ts.forEachChild(node, visit);
    }
    visit(file);
    assert.equal(progress.length, expectedCount, "Every checkout progress state must be checked");
    for (const element of progress) {
      const labels = element.children.filter(ts.isJsxElement).map((step) => {
        const label = step.children.find((child) => ts.isJsxElement(child) && child.openingElement.tagName.getText(file) === "b");
        return label && ts.isJsxElement(label)
          ? label.children.filter(ts.isJsxText).map((text) => text.text).join("")
          : null;
      });
      assert.deepEqual(labels, ["Bag", "Delivery", "Order prepared"]);
    }
  }
  assert.match(checkoutClient, /Save delivery & prepare order/);
  assert.match(checkoutClient, /Payments are not available yet/);
  assert.match(checkoutClient, /No charge has been made/);
  assert.match(checkoutClient, /This order remains Awaiting Payment/);
  assert.doesNotMatch(checkoutClient, /Next: Payment|Save delivery & prepare payment/);
});

test("pickup fee labels and displayed estimates remain flat per pickup", async () => {
  const pickup = await readFile(new URL("../components/pickup-tier-ui.tsx", import.meta.url), "utf8");
  const settings = await readFile(new URL("../app/admin/settings/page.tsx", import.meta.url), "utf8");
  for (const source of [pickup, settings]) {
    assert.doesNotMatch(source, /per[- ]item|for each item|perItemFee/i);
    assert.match(source, /flat (?:per pickup|pickup fee|fee for the whole pickup)/);
  }
  assert.doesNotMatch(pickup, /itemCount\s*\*/);
  assert.match(pickup, /Estimated pickup fee: <strong>\$\{money\(flatFee\)\}/);
  assert.match(pickup, /const flatFee = rules\.pickupRules\.lowValuePickupItemFeeCents/);
  assert.match(settings, /name="low_value_pickup_item_fee"/);
});

test("paid orders require payment and policy evidence", () => {
  assert.match(paymentSql, /orders_paid_requires_payment_evidence_check/i);
  assert.match(paymentSql, /provider_payment_id is not null/i);
  assert.match(paymentSql, /paid_at is not null/i);
  assert.match(paymentSql, /tax_cents is not null/i);
  assert.match(paymentSql, /buyer_terms_accepted_at is not null/i);
  assert.match(paymentSql, /payment_webhook_events/i);
  assert.match(paymentSql, /unique\(provider, provider_event_id\)/i);
  assert.match(paymentSql, /payload_sha256/i);
  assert.doesNotMatch(paymentSql, /payload\s+jsonb/i);
});

test("support AI describes below-threshold pickup fee as one flat fee", () => {
  assert.match(supportAi, /one flat \$\{money\(flatFee\)\} fee for the whole pickup/);
  assert.doesNotMatch(supportAi, /pickup fee is \$\{money\([^)]*\)\} per item/);
  assert.doesNotMatch(supportAi, /itemCount \* perItem/);
});

test("edge support origins can be configured for the future custom domain", () => {
  assert.match(supportAi, /ALLOWED_APP_ORIGINS/);
  assert.match(supportAi, /DEFAULT_ORIGIN = "https:\/\/lresale\.vercel\.app"/);
});
