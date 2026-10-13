import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Synthetic, in-memory Postgres only. No Supabase URL, network, real inventory,
// physical inspection, email, uploads, or production migrations are exercised.
const staff = "11111111-1111-4111-8111-111111111111";
const seller = "22222222-2222-4222-8222-222222222222";
const stranger = "33333333-3333-4333-8333-333333333333";
const pickup = "44444444-4444-4444-8444-444444444444";
const checks = { clean: true, intact: true, suitable_for_resale: true, no_significant_damage: true, wearable_without_stains_tears_holes: true };
const source = (file: string) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
function fn(file: string, name: string) {
  const sql = source(file);
  const start = sql.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf("$$;", sql.indexOf("as $$", start)) + 3);
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('test.aal',true),'is_anonymous',false)$$;
    grant usage on schema auth,public to authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${staff}'),('${seller}'),('${stranger}');
    create table public.admin_roles(user_id uuid,role text,require_mfa boolean,can_manage_pickups boolean,can_manage_shipping boolean,can_manage_security boolean,can_manage_selling_rules boolean);
    insert into public.admin_roles values('${staff}','owner',true,true,true,true,true);
    create table public.business_setting_versions(setting_key text,version int,value jsonb,effective_at timestamptz);
    insert into public.business_setting_versions values('selling_rules',1,'{"minimumIndividualItemValueCents":800,"minimumSellingPriceCents":800,"minimumPickupEstimatedValueCents":6000,"pickupRules":{"bagMinimumEstimatedValueCents":6000},"commissionTiers":[{"minCents":800,"maxCents":null,"sellerBps":4500,"platformBps":5500}]}',now());
    create function public.get_selling_rules() returns jsonb language sql stable security definer as $$select value from public.business_setting_versions order by version desc limit 1$$;
    create table public.collection_requests(id uuid primary key default gen_random_uuid(),user_id uuid,category text,status text default 'submitted',confirmation_status text default 'pending',request_type text,item_count int,estimated_resale_value_cents int not null,updated_at timestamptz,pickup_fee_cents int,pickup_pricing_mode text,priority_pickup boolean);
    create table public.items(id uuid primary key default gen_random_uuid(),owner_id uuid,collection_request_id uuid,name text,brand text,category text,status text,size text,item_condition text,initial_approved_price_cents int,listed_price_cents int,sold_price_cents int,seller_pricing_approved_at timestamptz,locked_seller_commission_bps int,locked_platform_commission_bps int,locked_commission_rule_version int,locked_commission_tier jsonb,photo_urls text[] default '{}',inspected_at timestamptz,published_at timestamptz,updated_at timestamptz,seller_rejection_reason text,seller_rejection_photo_url text);
    create table public.bundles(id uuid,owner_id uuid,status text,initial_approved_price_cents int,seller_pricing_approved_at timestamptz);
    create table public.audit_logs(admin_user_id uuid,action text,entity_type text,entity_id text,previous_value jsonb,new_value jsonb,reason text);
    create table public.item_rule_overrides(item_id uuid,override_type text,reason text,admin_user_id uuid);
    create table public.item_status_history(item_id uuid,old_status text,new_status text,changed_by uuid,reason text);
  `);
  await db.exec(source("20260905154500_enforce_mfa_on_legacy_admin_rpcs.sql"));
  await db.exec(fn("20260905143000_ops_security_logistics.sql", "private.assert_admin_permission"));
  await db.exec(source("20260905031000_configurable_pickup_minimum.sql"));
  await db.exec(fn("20260925035500_flat_low_value_pickup_fee.sql", "private.apply_collection_pickup_pricing"));
  await db.exec(`create trigger pickup_pricing before insert or update of estimated_resale_value_cents,request_type on public.collection_requests for each row execute function private.apply_collection_pickup_pricing();`);
  for (const name of ["admin_create_item_v2", "admin_set_item_photos", "admin_publish_item"]) await db.exec(fn("20260905170000_advanced_item_intake_catalog.sql", `public.${name}`));
  await db.exec(fn("20260905032000_admin_item_bundle_workflow.sql", "public.admin_review_item"));
  await db.exec(fn("20260924211500_seller_trust_and_intake_fees.sql", "public.admin_update_collection_request_status"));
  await db.exec(source("20260924211800_rejection_parameter_disambiguation.sql"));
  await db.exec(fn("20260905035000_commission_lock_snapshot.sql", "private.current_commission_resolution"));
  await db.exec(fn("20260905035000_commission_lock_snapshot.sql", "private.guard_item_commission"));
  await db.exec(`create trigger items_guard_commission before insert or update on public.items for each row execute function private.guard_item_commission();`);
  await db.exec(source("20260916173333_enforce_rpc_only_seller_pricing_approval.sql"));
  await db.exec(source("20261002010000_item_inspection_publication_gate.sql"));
  const identity = async (id: string, aal = "aal2") => db.exec(`reset role; select set_config('test.uid','${id}',false); select set_config('test.aal','${aal}',false); set role authenticated;`);
  const create = async (price = 800, action = "normal") => {
    const { rows } = await db.query<{id:string}>(`select public.admin_create_item_v2($1,$2,'Synthetic clothing','Test','women','M','Good',$3,$4,'Synthetic fixture only') as id`, [seller,pickup,price,action]);
    return rows[0].id;
  };
  return { db, identity, create };
}

test("synthetic seller lifecycle: CAD60 pickup, receipt, MFA inspection, reject/accept, owner price approval and publish", async () => {
  const { db, identity, create } = await fixture();
  try {
    await assert.rejects(db.exec(`insert into public.collection_requests(user_id,request_type,item_count,estimated_resale_value_cents) values('${seller}','bag',3,5999)`), /minimum|at least/);
    await assert.rejects(db.exec(`insert into public.collection_requests(user_id,request_type,item_count,estimated_resale_value_cents) values('${seller}','pickup',3,5999)`), /minimum/);
    await db.exec(`insert into public.collection_requests(id,user_id,request_type,item_count,estimated_resale_value_cents) values('${pickup}','${seller}','bag',3,6000)`);
    assert.equal((await db.query<{pickup_fee_cents:number}>(`select pickup_fee_cents from public.collection_requests where id='${pickup}'`)).rows[0].pickup_fee_cents,500);
    await identity(stranger);
    await assert.rejects(db.query(`select public.admin_update_collection_request_status($1,'collected')`,[pickup]), /admin/);
    await identity(staff,"aal1");
    await assert.rejects(create(), /permission/);
    await assert.rejects(db.query(`select public.admin_update_collection_request_status($1,'collected')`,[pickup]), /mfa/);
    await identity(staff);
    await assert.rejects(db.query(`select public.admin_update_collection_request_status($1,'collected')`,[pickup]), /Seller confirmation/);
    // Fixture confirmation stands in for the separate OTP/seller-confirmation flow.
    await db.exec(`reset role; update public.collection_requests set confirmation_status='confirmed' where id='${pickup}';`);
    await identity(staff);
    for (const status of ['scheduled','collected','inspection']) await db.query(`select public.admin_update_collection_request_status($1,$2)`,[pickup,status]);
    await assert.rejects(create(799), /Bundle|minimum/);
    const rejected = await create(799,"manual_review");
    await assert.rejects(db.query(`select public.admin_review_item_with_evidence($1,799,'reject','Failed physical check',null,null)`,[rejected]), /seller-facing/);
    await db.query(`select public.admin_review_item_with_evidence($1,799,'reject','Failed physical check','Synthetic damaged item','https://example.invalid/synthetic.jpg')`,[rejected]);
    await assert.rejects(db.query(`select public.admin_attest_item_inspection($1,$2)`,[rejected,checks]), /cannot be inspected/);
    const item = await create();
    await db.query(`select public.admin_set_item_photos($1,array['https://example.invalid/synthetic.jpg'])`,[item]);
    await assert.rejects(db.query(`select public.admin_publish_item($1)`,[item]), /Seller must approve/);
    await identity(stranger);
    await assert.rejects(db.query(`select public.approve_item_pricing($1,800)`,[item]), /unavailable/);
    await identity(seller);
    await assert.rejects(db.query(`select public.approve_item_pricing($1,801)`,[item]), /Pricing changed/);
    await db.query(`select public.approve_item_pricing($1,800)`,[item]);
    await assert.rejects(db.query(`select public.approve_item_pricing($1,800)`,[item]), /unavailable/);
    await identity(staff);
    await assert.rejects(db.query(`select public.admin_publish_item($1)`,[item]), /inspection/);
    await db.query(`select public.admin_set_item_photos($1,array[]::text[])`,[item]);
    await assert.rejects(db.query(`select public.admin_publish_item($1)`,[item]), /photo/);
    await db.query(`select public.admin_set_item_photos($1,array['https://example.invalid/synthetic.jpg'])`,[item]);
    await identity(staff,"aal1");
    await assert.rejects(db.query(`select public.admin_attest_item_inspection($1,$2)`,[item,checks]), /MFA/);
    await identity(staff);
    await db.query(`select public.admin_attest_item_inspection($1,$2)`,[item,checks]);
    await db.query(`select public.admin_attest_item_inspection($1,$2)`,[item,checks]);
    // Prove the pre-fix defect using the repository's current RPC and triggers.
    await db.query(`select public.admin_publish_item($1,1)`,[item]);
    await db.exec(`reset role;`);
    assert.equal((await db.query<{listed_price_cents:number}>(`select listed_price_cents from public.items where id=$1`,[item])).rows[0].listed_price_cents,1);
    await db.exec(source("20261013010000_clothing_publication_price_guard.sql"));
    await identity(staff);
    await assert.rejects(db.query(`select public.admin_publish_item($1,799)`,[item]), /minimum selling price/);
    await db.query(`select public.admin_publish_item($1,800)`,[item]);
    await db.exec(`reset role;`);
    await assert.rejects(db.query(`update public.items set inspected_at=null where id=$1`,[item]), /inspection/);
    await assert.rejects(db.query(`update public.items set listed_price_cents=1 where id=$1`,[item]), /minimum selling price/);
    await assert.rejects(db.query(`update public.items set initial_approved_price_cents=900 where id=$1`,[item]), /permanently locked/);
    await assert.rejects(db.query(`update public.items set status='relisted',listed_price_cents=799 where id=$1`,[item]), /minimum selling price/);
    await assert.rejects(db.query(`update public.items set listed_price_cents=null where id=$1`,[item]), /minimum selling price/);
    await db.exec(`update public.business_setting_versions set value=jsonb_set(value,'{minimumSellingPriceCents}','900')`);
    await assert.rejects(db.query(`update public.items set listed_price_cents=800 where id=$1`,[item]), /minimum selling price/);
    await db.exec(`update public.business_setting_versions set value=jsonb_set(value,'{minimumSellingPriceCents}','800')`);
    const { rows } = await db.query<{status:string;listed_price_cents:number;locked_seller_commission_bps:number}>(`select * from public.items where id=$1`,[item]);
    assert.equal(rows[0].status,'listed'); assert.equal(rows[0].listed_price_cents,800); assert.equal(rows[0].locked_seller_commission_bps,4500);
    assert.equal((await db.query(`select * from public.audit_logs where action='item.physical_inspection_passed'`)).rows.length,1);
    // Ordered happy path: physically inspected fixture -> accept -> seller approves -> publish.
    await identity(staff);
    const accepted = await create(800, 'manual_review');
    await db.query(`select public.admin_attest_item_inspection($1,$2)`,[accepted,checks]);
    await db.query(`select public.admin_review_item($1,800,'accept',null)`,[accepted]);
    await db.query(`select public.admin_set_item_photos($1,array['https://example.invalid/synthetic.jpg'])`,[accepted]);
    await identity(seller);
    await db.query(`select public.approve_item_pricing($1,800)`,[accepted]);
    await identity(staff);
    await db.query(`select public.admin_publish_item($1)`,[accepted]);
    await db.exec(`reset role;`);
    assert.equal((await db.query<{status:string}>(`select status from public.items where id=$1`,[accepted])).rows[0].status,'listed');

  } finally { await db.close(); }
});

test("publication floor is surfaced in admin form and validated before attestation", () => {
  const page = readFileSync(new URL('../app/admin/items/page.tsx',import.meta.url),'utf8');
  const actions = readFileSync(new URL('../app/admin/items/actions.ts',import.meta.url),'utf8');
  assert.match(page, /name="listed_price" type="number" min=\{rules.minimumSellingPriceCents \/ 100\}/);
  const publish = actions.slice(actions.indexOf('export async function publishAdminItem'),actions.indexOf('export async function createAdminBundle'));
  assert.match(publish,/listedPriceCents < rules.minimumSellingPriceCents/);
  assert.ok(publish.indexOf('listedPriceCents < rules.minimumSellingPriceCents') < publish.indexOf('await attestInspection'));
});
