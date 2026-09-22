import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260905143000_ops_security_logistics.sql", import.meta.url), "utf8");
const hardened = await readFile(new URL("../supabase/migrations/20260905150000_harden_logistics_tables.sql", import.meta.url), "utf8");
const adminAuth = await readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8");

test("privileged admin writes require server-side permission and AAL2", () => {
  assert.match(migration, /perform private\.assert_admin_permission\('shipping'\)/i);
  assert.match(migration, /if ar\.require_mfa and aal <> 'aal2'/i);
  assert.match(adminAuth, /supabase\.rpc\("admin_access_context"\)/i);
});

test("operational tables are RLS protected and not directly writable by clients", () => {
  assert.match(hardened, /alter table public\.shipping_settings enable row level security/i);
  assert.match(hardened, /revoke all on public\.shipping_settings from anon, authenticated/i);
  assert.match(hardened, /revoke all on public\.pickup_reminder_jobs from anon, authenticated/i);
});

test("public shipping policy is read-only and exposes no admin identity", () => {
  assert.match(hardened, /create or replace function public\.get_shipping_policy\(\)/i);
  assert.doesNotMatch(hardened, /get_shipping_policy[\s\S]*updated_by[\s\S]*grant execute/i);
});
