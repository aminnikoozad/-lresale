import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  assert.match(checkoutClient, /accept_checkout_terms/);
  assert.match(checkoutClient, /BUYER_TERMS_VERSION/);
  assert.match(checkoutClient, /RETURN_POLICY_VERSION/);
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
