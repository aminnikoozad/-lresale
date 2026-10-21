/** Full production-catalog SQL flow. Uses synthetic rows and an offline PGlite database only. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { restoreCatalog } from "./pricing-schema-rehearsal.ts";
import { analyzePricing, type PricingInput } from "../lib/pricing/engine.ts";
const snapshotPath = process.argv[2];
if (!snapshotPath)
  throw new Error(
    "An offline metadata snapshot path is required; no production connection is supported.",
  );
const { db, ...metadata } = await restoreCatalog(snapshotPath);
const id = (n: number) =>
  `920261${String(n).padStart(2, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  seller = id(2),
  buyer = id(3),
  outsider = id(4);
const checks: string[] = [];
const identity = async (uid: string, role = "authenticated", aal = "aal2") => {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claims',$3,false)",
    [uid, role, JSON.stringify({ sub: uid, role, aal, is_anonymous: false })],
  );
  await db.exec(`set role ${role}`);
};
const one = async <T>(sql: string, args: unknown[] = []) =>
  (await db.query<{ v: T }>(sql, args)).rows[0].v;
try {
  const rulesBefore = await one<unknown>("select public.get_selling_rules() v");
  await db.exec(`insert into public.pilot_settings default values;insert into public.shipping_settings default values;insert into public.postal_config default values;insert into private.buyer_payment_connection default values;insert into public.buyer_offer_settings default values;
 insert into private.checkout_policy_versions(singleton,buyer_terms_version,return_policy_version,privacy_notice_version)values(true,'2026-09-25','2026-09-25','2026-09-25');`);
  for (const [uid, name] of [
    [admin, "qa_pricing_admin"],
    [seller, "qa_pricing_seller"],
    [buyer, "qa_pricing_buyer"],
    [outsider, "qa_pricing_other"],
  ])
    await db.query(
      `insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at,email_confirmed_at)values($1,'authenticated','authenticated',$2,$3,now(),now(),now())`,
      [
        uid,
        `${name}@example.invalid`,
        JSON.stringify({
          username: name,
          full_name: "Synthetic pricing rehearsal",
        }),
      ],
    );
  await db.query(
    "insert into public.admin_roles(user_id,role,require_mfa,can_manage_pickups)values($1,'owner',true,true)",
    [admin],
  );
  const area = await one<string>(
    "insert into public.service_areas(city,active,pickup_mode,within_local_radius)values('Montréal',true,'free',true)returning id v",
  );
  const slot = await one<string>(
    "insert into public.pickup_slots(service_area_id,window_start,window_end,capacity,calendar_managed)values($1,now()+interval '3 days',now()+interval '3 days 2 hours',10,true)returning id v",
    [area],
  );
  await identity(seller);
  await db.query(
    "select public.accept_team_pricing_mandate('2026-10-15-team-v1')",
  );
  const bagSql = `insert into public.collection_requests(user_id,request_type,category,address,service_area_id,pickup_slot_id,item_count,estimated_resale_value_cents,condition_confirmed,policy_accepted,pickup_policy_accepted,hold_terms_accepted,contact_phone,pickup_address)values($1,'bag','clothing','123 Synthetic Street, Montreal, QC, H1A 1A1, Canada',$2,$3,3,$4,true,true,true,true,'+15145550101','{"street":"123 Synthetic Street","city":"Montréal","postal_code":"H1A 1A1","country":"CA"}')returning id v`;
  await assert.rejects(
    one(bagSql, [seller, area, slot, 5999]),
    /minimum|6000|at least|below/i,
  );
  const bag = await one<string>(bagSql, [seller, area, slot, 6000]);
  checks.push("Bag minimum CAD 60 and seller ownership");
  await db.query("select public.confirm_own_pickup($1)", [bag]);
  await identity(admin);
  await db.query(
    "select public.admin_update_collection_request_status($1,'collected')",
    [bag],
  );
  await db.query(
    "select public.admin_update_collection_request_status($1,'inspection')",
    [bag],
  );
  const subcategory = "Tops";
  assert.equal(
    await one<boolean>(
      "select public.is_valid_catalog_subcategory('women',$1) v",
      [subcategory],
    ),
    true,
  );
  const item = await one<string>(
    "select public.admin_create_item_v5($1,$2,'Synthetic QA shirt','QA Brand','women',$3,'M','Good',2000,'normal',null,'Blue','Cotton',null) v",
    [seller, bag, subcategory ?? "tops"],
  );
  await db.exec("reset role");
  const beforeRows = await one<unknown>(
    "select to_jsonb(i) v from public.items i where id=$1",
    [item],
  );
  const applied = readFileSync(
    new URL(
      "../supabase/migrations/20261020182321_ai_pricing_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec("reset role");
  await db.exec(applied);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261021015521_ai_pricing_admin_switch.sql", import.meta.url), "utf8"));
  assert.deepEqual(
    await one<unknown>(
      "select to_jsonb(i)-'pricing_approval_id' v from public.items i where id=$1",
      [item],
    ),
    beforeRows,
  );
  assert.deepEqual(
    await one<unknown>("select public.get_selling_rules() v"),
    rulesBefore,
  );
  checks.push("Migration preserves existing item rows and selling rules");
  await identity(admin);
  await assert.rejects(
    db.query("select public.admin_publish_item($1,2000)", [item]),
    /Approve/,
  );
  await assert.rejects(
    db.query("select public.admin_attest_item_inspection($1,'{}')", [item]),
    /checks/,
  );
  await db.query(
    `select public.admin_attest_item_inspection($1,'{"clean":true,"intact":true,"suitable_for_resale":true,"no_significant_damage":true,"wearable_without_stains_tears_holes":true}')`,
    [item],
  );
  const photos = ["front", "back", "size_label"].map(
    (role) => `https://example.invalid/synthetic-pricing/${role}.jpg`,
  );
  await db.query("select public.admin_set_item_photos($1,$2::text[])", [
    item,
    photos,
  ]);
  await db.query(
    "select public.admin_save_clothing_evidence($1,$2::jsonb,'{}','{}')",
    [
      item,
      JSON.stringify(
        photos.map((url, n) => ({
          url,
          role: ["front", "back", "size_label"][n],
        })),
      ),
    ],
  );
  await db.query(
    "select public.admin_review_item($1,2000,'accept','Synthetic physical inspection complete')",
    [item],
  );
  checks.push("Recorded physical inspection and clothing evidence");
  const workspace = () =>
    one<{ snapshot: string; input: PricingInput }>(
      "select public.admin_pricing_workspace($1) v",
      [item],
    );
  let w = await workspace();
  await db.query("select public.admin_approve_item_price($1,$2,2000,$3,null)", [
    item,
    w.snapshot,
    "Synthetic manual pricing review; costs remain unconfigured",
  ]);
  await db.query("select public.admin_publish_item($1,2000)", [item]);
  checks.push("Manual approval and exact-price publication");
  await identity(seller);
  const safe = await one<Array<Record<string, unknown>>>(
    "select public.my_priced_items() v",
  );
  assert.equal(safe[0].listed_price_cents, 2000);
  assert.equal(safe[0].estimated_seller_earnings_cents, 900);
  await assert.rejects(
    db.query("select initial_approved_price_cents from public.items"),
  );
  checks.push("Seller sees final price/share, no raw prices");
  await identity(outsider);
  assert.deepEqual(await one("select public.my_priced_items() v"), []);
  await assert.rejects(workspace());
  await identity(admin);
  assert.equal((await one<{ enabled: boolean }>("select public.admin_pricing_control() v")).enabled, false);
  await db.query("select public.admin_set_pricing_enabled(1,true,'Enable analysis after manual approval in isolated rehearsal')");
  const job = await one<string>(
    "select public.admin_request_pricing_analysis($1) v",
    [item],
  );
  await identity(admin, "service_role");
  const jobs = await one<
    Array<{ id: string; input: PricingInput; lease_token: string }>
  >("select public.claim_pricing_jobs(10) v");
  assert.equal(jobs[0].id, job);
  await db.query("select public.finish_pricing_job($1,$2,$3::jsonb)", [
    job,
    jobs[0].lease_token,
    JSON.stringify(analyzePricing(jobs[0].input)),
  ]);
  checks.push("Service-only background analysis");
  await identity(buyer);
  const order = await one<string>(
    "select public.prepare_checkout_with_terms($1::uuid[],null,null,'Synthetic Buyer','123 Synthetic Street',null,'Montreal','QC','H1A 1A1','2026-09-25','2026-09-25','2026-09-25') v",
    [[item]],
  );
  await identity(admin);
  w = await workspace();
  await assert.rejects(
    db.query("select public.admin_approve_item_price($1,$2,2200,$3,null)", [
      item,
      w.snapshot,
      "Concurrent repricing must be blocked",
    ]),
    /reservation/,
  );
  checks.push("Active checkout blocks repricing");
  await db.exec("reset role");
  await db.query(
    "update public.orders set shipping_cents=500,tax_cents=100,total_cents=subtotal_cents+600 where id=$1",
    [order],
  );
  await db.exec(
    "update private.buyer_payment_connection set provider='local-synthetic-gateway',enabled=true where id",
  );
  const payment = await one<{ id: string; amount: number }>(
    "insert into public.order_payment_attempts(order_id,buyer_id,provider,provider_checkout_id,expected_total_cents,status)select id,buyer_id,'local-synthetic-gateway',id::text,total_cents,'pending'from public.orders where id=$1 returning jsonb_build_object('id',id,'amount',expected_total_cents)v",
    [order],
  );
  await identity(admin, "service_role");
  const pay = () =>
    db.query(
      "select public.accept_verified_buyer_payment($1,'local-fixture-event','local-fixture-payment',repeat('a',64),$2,'CAD',true)",
      [payment.id, payment.amount],
    );
  // Reproduce the actual schema incompatibility before the forward-only fix.
  await assert.rejects(pay(), /generated|DEFAULT/);
  checks.push("Reproduced generated-earnings payment incompatibility");
  await db.exec("reset role");
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20261020185852_pricing_payment_generated_earnings_compatibility.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await identity(admin, "service_role");
  await pay();
  await pay();
  checks.push("Verified-payment application and idempotency after forward fix");
  await db.exec("reset role");
  assert.equal(
    await one<number>(
      "select seller_cents v from public.order_seller_credits where item_id=$1",
      [item],
    ),
    900,
  );
  const paidSnapshot = await one<unknown>(
    "select to_jsonb(o) v from public.orders o where id=$1",
    [order],
  );
  await identity(admin);
  w = await workspace();
  await assert.rejects(
    db.query("select public.admin_approve_item_price($1,$2,2300,$3,null)", [
      item,
      w.snapshot,
      "Paid item pricing must remain unchanged",
    ]),
    /unavailable/,
  );
  await db.exec("reset role");
  assert.deepEqual(
    await one("select to_jsonb(o) v from public.orders o where id=$1", [order]),
    paidSnapshot,
  );
  checks.push("Paid order unchanged; seller credit exactly once");
  await db.query(
    "update public.orders set payment_status='refunded',refunded_at=now()where id=$1",
    [order],
  );
  assert.ok(
    await one(
      "select reversed_at v from public.order_seller_credits where item_id=$1",
      [item],
    ),
  );
  checks.push("Refund reverses pending seller credit; no bank payout invoked");
  console.log(
    JSON.stringify(
      {
        ok: true,
        ...metadata,
        checks,
        externalCalls: 0,
        realPayments: 0,
        productionWrites: 0,
        limitations: [
          "SQL/JWT claims are simulated; not real Auth or MFA",
          "Browser, provider gateway, real settlement and payout remain cloud-staging gates",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        checks,
        error: (error as Error).message,
        where: (error as { where?: string }).where,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
