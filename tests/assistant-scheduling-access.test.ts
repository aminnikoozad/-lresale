import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../supabase/functions/rewear-assistant/index.ts',import.meta.url),'utf8');
test('private pickup scheduling uses the verified customer client, never anonymous public access',()=>{
 for(const table of ['service_areas','pickup_slots']) {
  assert.ok(source.includes(`user && !user.is_anonymous ? userClient\n        .from("${table}")`));
  assert.ok(!source.includes(`publicClient\n        .from("${table}")`));
 }
 assert.equal((source.match(/Promise.resolve\(\{ data: null, error: null \}\)/g)||[]).length,2);
});
test('guest and failed scheduling reads are explicitly unavailable, not empty inventory',()=>{
 assert.ok(source.includes('scheduling_status: !user || user.is_anonymous'));
 assert.ok(source.includes('? "sign_in_required"'));
 assert.ok(source.includes('areas.error || slots.error ? "unavailable" : "available"'));
 assert.ok(source.includes('Never interpret either status as no pickup availability'));
 assert.ok(source.includes('slots: slots.error ? null : user && !user.is_anonymous'));
});
