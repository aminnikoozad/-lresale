import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind } from "typescript";
import { PGlite } from "@electric-sql/pglite";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sourceModule = (source: string) => `data:text/javascript;base64,${Buffer.from(transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext } }).outputText).toString("base64")}`;
const homeUrl = new URL("../lib/home-decor.ts", import.meta.url).href;
const taxonomyUrl = sourceModule(read("../lib/catalog-taxonomy.ts").replace('"./home-decor"', JSON.stringify(homeUrl)));
const pilotUrl = sourceModule(read("../lib/pilot-settings.ts").replace('"./catalog-taxonomy"', JSON.stringify(taxonomyUrl)));
const taxonomy = await import(taxonomyUrl);
const pilot = await import(pilotUrl);
const expansion = read("../supabase/migrations/20261010000121_expand_clothing_pilot.sql");

test("clothing defaults expose all three departments with valid independent taxonomies", () => {
  assert.deepEqual(pilot.DEFAULT_PILOT_SETTINGS.categories, ["women", "men", "kids"]);
  assert.deepEqual(taxonomy.ACTIVE_CATALOG_CATEGORIES.map((entry: { value: string }) => entry.value), ["women", "men", "kids"]);
  for (const category of ["women", "men", "kids"]) {
    assert.equal(pilot.pilotAllowsCategory(category, pilot.DEFAULT_PILOT_SETTINGS), true);
    assert.ok(taxonomy.subcategoriesFor(category).length > 10);
    for (const subcategory of taxonomy.subcategoriesFor(category)) {
      assert.equal(taxonomy.isCatalogSubcategory(category, subcategory), true);
    }
  }
  assert.equal(taxonomy.isCatalogSubcategory("kids", "Blazers & Suits"), false);
  assert.equal(pilot.pilotAllowsCategory("electronics", pilot.DEFAULT_PILOT_SETTINGS), false);
  const custom = pilot.normalizePilotSettings({ enabled: true, categories: ["kids"], item_cap: 12 });
  assert.deepEqual(custom.categories, ["kids"]);
  assert.equal(custom.itemCap, 12);
  assert.equal(pilot.pilotAllowsCategory("women", custom), false);
});

test("expansion enables pickup and listing for women, men and kids without opening other categories", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema private;
      create table public.pilot_settings(id boolean primary key, enabled boolean default true,
        categories text[] default array['women'], item_cap integer, pickup_days integer[] default array[0,6],
        duration_weeks integer default 8, started_at timestamptz, updated_at timestamptz);
      insert into public.pilot_settings(id, categories, item_cap) values(true,array['women'],7);
      create table public.collection_requests(category text);
      create table public.items(id uuid default gen_random_uuid(), category text, status text);
    `);
    const enforce = read("../supabase/migrations/20260924130000_enforce_dynamic_pilot.sql");
    await db.exec(enforce.slice(0, enforce.indexOf("create or replace function private.reserve_pickup_slot()")));
    await assert.rejects(db.exec("insert into public.collection_requests values('men')"));
    await db.exec(expansion);
    await db.exec(expansion); // Safe to replay; no duplicate categories.
    const settings = (await db.query("select * from public.pilot_settings")).rows[0];
    assert.deepEqual(settings.categories, ["women", "men", "kids"]);
    assert.equal(settings.item_cap, 7);
    assert.deepEqual(settings.pickup_days, [0, 6]);
    for (const category of ["women", "men", "kids"]) {
      await db.query("insert into public.collection_requests values($1)", [category]);
      await db.query("insert into public.items(category,status) values($1,'listed')", [category]);
    }
    await assert.rejects(db.exec("insert into public.collection_requests values('electronics')"));
    await assert.rejects(db.exec("insert into public.items(category,status) values('electronics','listed')"));
    await db.exec("update public.pilot_settings set categories=array['kids'],enabled=false");
    await db.exec(expansion);
    const custom = (await db.query("select categories,enabled from public.pilot_settings")).rows[0];
    assert.deepEqual(custom.categories, ["kids"]);
    assert.equal(custom.enabled, false);
    await db.exec("delete from public.pilot_settings; insert into public.pilot_settings(id) values(true)");
    assert.deepEqual((await db.query("select categories from public.pilot_settings")).rows[0].categories, ["women", "men", "kids"]);
  } finally { await db.close(); }
});
