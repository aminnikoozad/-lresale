import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSellingRules, DEFAULT_SELLING_RULES } from '../lib/business-rules.ts';
const migration = readFileSync(new URL('../supabase/migrations/20261017140000_public_selling_rules_projection.sql', import.meta.url), 'utf8');

test('policy helper calls the restricted public projection and preserves live values', async () => {
  let called = '';
  const client = { rpc: async (name: string) => { called = name; return {data: {...DEFAULT_SELLING_RULES, minimumPickupEstimatedValueCents: 12300}, error:null}; } };
  const rules = await loadSellingRules(client as never);
  assert.equal(called, 'get_public_selling_rules');
  assert.equal(rules.minimumPickupEstimatedValueCents, 12300);
});
test('failed public projection keeps existing defensive fallback', async () => {
  const client = {rpc: async () => ({data:null,error:{code:'42501'}})};
  assert.equal(await loadSellingRules(client as never), DEFAULT_SELLING_RULES);
});
test('migration adds narrow public projection and enforces old private boundary without table grants', () => {
  assert.match(migration, /revoke execute on function public\.get_selling_rules\(\) from public, anon/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.get_public_selling_rules\(\) from public/);
  assert.match(migration, /grant execute on function public\.get_public_selling_rules\(\) to anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant .* on (?:table|all|function public\.get_selling_rules)/i);
  assert.doesNotMatch(migration, /jsonb_each|select\s+value|jsonb_build_object\([^;]*'pickupRules',\s*v->/i);
  for (const key of ['commissionTiers','discountSchedule','pickupRules']) assert.ok(migration.includes(`'${key}'`));
  assert.match(migration, /jsonb_typeof\(\(v->'pickupRules'\)->'processingFeeCents'\) = 'number'/);
});
test('assistant calls the public projection without receiving full private settings JSON', () => {
  const source = readFileSync(new URL('../supabase/functions/rewear-assistant/index.ts', import.meta.url),'utf8');
  assert.ok(source.includes('publicClient.rpc("get_public_selling_rules")'));
  assert.ok(!source.includes('publicClient.rpc("get_selling_rules")'));
});
