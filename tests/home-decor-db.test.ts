import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260921115514_home_decor_managed_resale.sql",
    import.meta.url,
  ),
  "utf8",
);
// Isolated Postgres fixture: the existing auth boundary and legacy function bodies,
// with only the tables those functions use. No production users/data are touched.
const owner = "00000000-0000-4000-8000-000000000001";
const customer = "00000000-0000-4000-8000-000000000002";
const stranger = "00000000-0000-4000-8000-000000000003";
const warehouse = "00000000-0000-4000-8000-000000000004";
function legacy(file: string, name: string) {
  const s = readFileSync(
    new URL(`../supabase/migrations/${file}`, import.meta.url),
    "utf8",
  );
  const start = s
    .toLowerCase()
    .indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0);
  return s.slice(start, s.indexOf("$$;", s.indexOf("as $$", start)) + 3);
}
test("Home schema: role isolation, approval gates, public projection and legacy intake", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
 create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${customer}'),('${stranger}'),('${warehouse}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
 create table public.admin_roles(user_id uuid,role text,require_mfa boolean default true);
 insert into public.admin_roles values('${owner}','owner',true),('${warehouse}','warehouse',true);
 create function public.can_manage_items() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('owner','admin','operations_manager','warehouse') and (not require_mfa or auth.jwt()->>'aal'='aal2'))$$;
 create function public.get_selling_rules() returns jsonb language sql as $$select '{"minimumIndividualItemValueCents":2500}'::jsonb$$;
 create table public.collection_requests(id uuid primary key,user_id uuid,category text constraint collection_category check(category in ('clothing','shoes','electronics')));
 create table public.items(id uuid primary key default gen_random_uuid(),owner_id uuid,collection_request_id uuid,name text,brand text,category text constraint items_category check(category in ('women','men','kids','electronics','shoes','accessories')),status text,size text,item_condition text,initial_approved_price_cents int,listed_price_cents int,seller_pricing_approved_at timestamptz,photo_urls text[] default '{}',material text,color text,pattern text,condition_notes text,inspected_at timestamptz,updated_at timestamptz default now());
 create table public.audit_logs(admin_user_id uuid,action text,entity_type text,entity_id text,previous_value jsonb,new_value jsonb,reason text);
 create table public.item_rule_overrides(item_id uuid,override_type text,reason text,admin_user_id uuid);
 create table public.item_status_history(item_id uuid,old_status text,new_status text,changed_by uuid,reason text);
 `);
    await db.exec(
      legacy(
        "20260905170000_advanced_item_intake_catalog.sql",
        "admin_create_item_v2",
      ),
    );
    await db.exec(
      legacy(
        "20260905032000_admin_item_bundle_workflow.sql",
        "admin_review_item",
      ),
    );
    await db.exec(migration);
    const identity = async (
      id: string,
      aal = "aal2",
      role = "authenticated",
    ) => {
      await db.exec(
        `reset role;set test.uid='${id}';set test.aal='${aal}';set role ${role};`,
      );
    };
    await identity(owner);
    await db.query(
      "select public.admin_save_home_rules($1,true,false)",
      [5000],
    );
    await assert.rejects(
      db.query(
        `select public.admin_create_item_v2($1,null,'Small vase','Maker','home_decor',null,null,3000,'normal',null)`,
        [customer],
      ),
      /Below|minimum|Bundle/,
    );
    const created = await db.query<{ id: string }>(
      `select public.admin_create_item_v2($1,null,'Home vase','Maker','home_decor',null,null,7500,'normal',null) id`,
      [customer],
    );
    const id = created.rows[0].id;
    await db.query(
      `select public.admin_create_item_v2($1,null,'Fashion coat','Maker','women',null,null,3000,'normal',null)`,
      [customer],
    );
    await db.exec("reset role");
    await db.query(
      "update public.items set photo_urls=$1,seller_pricing_approved_at=now(),listed_price_cents=7500 where id=$2",
      [["https://example.test/hero", "https://example.test/defect"], id],
    );
    await identity(owner);
    const valid = {
      public_data: {
        subcategory: "Vases",
        material: "Ceramic",
        condition: "Good",
        condition_notes: "Small disclosed chip",
        era: "Unknown",
        delivery_note: "Shipping requires review before payment.",
        height_cm: 20,
        width_cm: 10,
        depth_cm: 10,
        weight_kg: 1,
        visible_defects: "Chip on base",
      },
      staff_data: {
        inspection_notes: "PRIVATE STAFF NOTE",
        seller_reported_age: "PRIVATE CLAIM",
        packaged_length_cm: 25,
        packaged_width_cm: 15,
        packaged_height_cm: 15,
        packaged_weight_kg: 2,
      },
      checks: Object.fromEntries(
        [
          "clean",
          "structurally_sound",
          "suitable_for_resale",
          "no_severe_damage",
          "shippable",
          "inspectable",
          "resale_permitted",
          "marks_reviewed",
          "inspection_complete",
          "shipping_reviewed",
        ].map((k) => [k, true]),
      ),
      photos: [],
      inspection_stage: "Ready to List",
      defects: ["chips"],
      compliance_flags: [],
    };
    const photos = [
      { url: "https://example.test/hero", role: "hero" },
      { url: "https://example.test/defect", role: "defect" },
    ];
    const save = async (payload: unknown = valid, pics: unknown = photos) =>
      db.query("select public.admin_save_home_item($1,$2::jsonb,$3::jsonb)", [
        id,
        JSON.stringify(payload),
        JSON.stringify(pics),
      ]);
    const publish = async () => {
      await db.exec("reset role");
      try {
        await db.query("update public.items set status='listed' where id=$1", [
          id,
        ]);
      } finally {
        await identity(owner);
      }
    };
    await assert.rejects(
      save({
        ...valid,
        public_data: { ...valid.public_data, inspection_notes: "LEAK" },
      }),
      /Unrecognized/,
    );
    await assert.rejects(
      save(valid, [{ ...photos[0], secret: "LEAK" }]),
      /Invalid photo/,
    );
    await assert.rejects(
      save(valid, [{ url: "https://attacker.test/image", role: "hero" }]),
      /uploaded/,
    );
    await save({
      ...valid,
      public_data: { ...valid.public_data, height_cm: undefined },
    });
    await assert.rejects(publish(), /Measurements/);
    await save(valid, [photos[0], { ...photos[1], role: "detail" }]);
    await assert.rejects(publish(), /Defect photos/);
    await save({ ...valid, compliance_flags: ["authenticity concern"] });
    await assert.rejects(publish(), /Compliance Review Required/);
    await identity(warehouse);
    await assert.rejects(save(), /remove compliance flags/);
    await assert.rejects(
      save({
        ...valid,
        checks: { ...valid.checks, compliance_reviewed: true },
      }),
      /Owner\/Admin/,
    );
    await identity(owner);
    await save({ ...valid, inspection_stage: "Needs Specialist Review" });
    await assert.rejects(publish(), /Specialist/);
    await save();
    await assert.rejects(publish(), /Specialist/); // persistent flag cannot be silently cleared
    await save({
      ...valid,
      staff_data: {
        ...valid.staff_data,
        specialist_review_notes:
          "Reviewed by approved specialist, suitable for listing.",
      },
      checks: { ...valid.checks, specialist_reviewed: true },
    });
    await publish();
    await identity(customer, "aal1");
    const hidden = await db.query("select * from public.home_item_details");
    assert.equal(hidden.rows.length, 0);
    const adminList = await db.query<{ admin_home_items: unknown[] }>(
      "select public.admin_home_items()",
    );
    assert.deepEqual(adminList.rows[0].admin_home_items, []);
    await assert.rejects(save(), /permission/);
    await assert.rejects(
      db.query("select public.admin_save_home_rules(1,true,true)"),
      /permission/,
    );
    const publicView = await db.query(
      "select * from public.home_catalog_details()",
    );
    assert.equal(publicView.rows.length, 1);
    assert.ok(!JSON.stringify(publicView.rows).includes("PRIVATE"));
    assert.ok(JSON.stringify(publicView.rows).includes("chips"));
    await identity(stranger, "aal1");
    assert.equal(
      (await db.query("select * from public.home_item_details")).rows.length,
      0,
    );
    await identity(owner, "aal1");
    await assert.rejects(save(), /permission/);
    assert.equal(
      (await db.query("select * from public.home_item_details")).rows.length,
      0,
    );
    await identity("", "aal1", "anon");
    await assert.rejects(
      db.query("select * from public.home_item_details"),
      /permission denied/,
    );
    assert.equal(
      (await db.query("select * from public.home_catalog_details()")).rows
        .length,
      1,
    );
    await identity(owner);
    await save({
      ...valid,
      staff_data: {
        ...valid.staff_data,
        specialist_review_notes: "Review remains documented.",
      },
      checks: { ...valid.checks, specialist_reviewed: true },
    });
    assert.equal(
      (await db.query("select * from public.home_catalog_details()")).rows
        .length,
      0,
    ); // editing unpublishes
  } finally {
    await db.close();
  }
});
