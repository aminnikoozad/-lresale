import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../supabase/migrations/20261002010000_item_inspection_publication_gate.sql", import.meta.url), "utf8");
const staff = "11111111-1111-4111-8111-111111111111";
const buyer = "22222222-2222-4222-8222-222222222222";
const item = "33333333-3333-4333-8333-333333333333";
const checks = JSON.stringify({ clean: true, intact: true, suitable_for_resale: true, no_significant_damage: true, wearable_without_stains_tears_holes: true });

for (const category of ["women", "men", "kids"]) {
test(`${category}: only MFA staff can attest inspection; listing requires a recorded attestation`, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on all functions in schema auth to authenticated, anon;
      create function public.can_manage_items() returns boolean language sql stable security definer as $$select auth.uid()='${staff}'::uuid$$;
      grant execute on function public.can_manage_items() to authenticated;
      create table public.items(id uuid primary key,category text,status text,inspected_at timestamptz,updated_at timestamptz,published_at timestamptz);
      insert into public.items(id,category,status) values('${item}','${category}','accepted');
      create table public.audit_logs(admin_user_id uuid,action text,entity_type text,entity_id text,new_value jsonb,reason text);
    `);
    await db.exec(migration);
    const identity = async (id: string, aal = "aal2") => {
      await db.exec(`reset role; select set_config('test.uid','${id}',false); select set_config('test.aal','${aal}',false); set role authenticated;`);
    };
    await identity(buyer);
    await assert.rejects(db.query(`select public.admin_attest_item_inspection('${item}','${checks}'::jsonb)`));
    await identity(staff, "aal1");
    await assert.rejects(db.query(`select public.admin_attest_item_inspection('${item}','${checks}'::jsonb)`));
    await identity(staff);
    await db.exec(`reset role`);
    await assert.rejects(db.exec(`update public.items set status='listed',published_at=now() where id='${item}'`));
    await identity(staff);
    await assert.rejects(db.query(`select public.admin_attest_item_inspection('${item}','{}'::jsonb)`));
    await assert.rejects(db.query(`select public.admin_attest_item_inspection('${item}','${checks}'::jsonb - 'wearable_without_stains_tears_holes')`));
    await db.query(`select public.admin_attest_item_inspection('${item}','${checks}'::jsonb)`);
    await db.query(`select public.admin_attest_item_inspection('${item}','${checks}'::jsonb)`);
    await db.exec(`reset role`);
    const record = await db.query<{inspected_at:string}>(`select inspected_at from public.items where id='${item}'`);
    assert.ok(record.rows[0].inspected_at);
    const logs = await db.query(`select * from public.audit_logs`);
    assert.equal(logs.rows.length,1);
    await db.exec(`update public.items set status='listed',published_at=now() where id='${item}'`);
    await db.exec(`insert into public.items(id,category,status) values('44444444-4444-4444-8444-444444444444','${category}','accepted')`);
    await assert.rejects(db.exec(`update public.items set status='listed' where id='44444444-4444-4444-8444-444444444444'`));
  } finally { await db.close(); }
});

}
