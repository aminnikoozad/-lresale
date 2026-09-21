import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260921141207_checkout_reservation_and_admin_rate_limit_hardening.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

test("checkout reservation is atomic and expires", () => {
  assert.match(sql, /reservation_until timestamptz := now\(\) \+ interval '10 minutes'/i);
  assert.match(sql, /order by i\.id\s+for update/i);
  assert.match(sql, /insert into public\.inventory_reservations/i);
  assert.match(sql, /status='active'\s+and r\.expires_at > now\(\)/i);
  assert.match(sql, /active_count \+ expected_count > 25/i);
});

test("public catalog hides currently reserved inventory", () => {
  const reservationFilter = /not exists \([\s\S]*?public\.inventory_reservations[\s\S]*?r\.status='active'[\s\S]*?r\.expires_at>now\(\)/gi;
  const matches = sql.match(reservationFilter) ?? [];
  assert.ok(matches.length >= 3, "catalog list, item detail and home detail must all exclude active reservations");
});

test("admin login rate-limit storage is bounded", () => {
  assert.match(sql, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /updated_at < now\(\) - interval '2 hours'/i);
  assert.match(sql, /count\(\*\).*>= 2048/is);
  assert.match(sql, /revoke all on function public\.record_admin_login_failure\(text\) from public/i);
});
