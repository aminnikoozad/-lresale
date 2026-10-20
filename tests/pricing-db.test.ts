import test from "node:test";
import assert from "node:assert/strict";
import { pricingFixture, newItem } from "./fixtures/pricing-db.ts";
import {
  identity,
  staff,
  seller,
  other,
  buyer,
  attempt,
} from "./fixtures/buyer-sales-db.ts";
import { analyzePricing, type PricingInput } from "../lib/pricing/engine.ts";
const id = "20000000-0000-4000-8000-000000000001";
const second = "20000000-0000-4000-8000-000000000002";
type DB = Awaited<ReturnType<typeof pricingFixture>>;
const workspace = async (db: DB) =>
  (
    await db.query<{
      v: {
        snapshot: string;
        item: { pricing_approval_id: string };
        input: PricingInput;
        approvals: unknown[];
        analyses: { id: string; status: string }[];
      };
    }>("select public.admin_pricing_workspace($1) v", [id])
  ).rows[0].v;
const approve = async (db: DB, price = 2000, analysis: string | null = null) =>
  db.query("select public.admin_approve_item_price($1,$2,$3,$4,$5)", [
    id,
    (await workspace(db)).snapshot,
    price,
    "Physical inspection and current evidence reviewed",
    analysis,
  ]);

test("pricing approval, privacy, stale decisions, automatic publication and commission lock", async () => {
  const db = await pricingFixture();
  try {
    await newItem(db, id);
    await identity(db, staff, "authenticated", "aal1");
    await assert.rejects(workspace(db), /MFA/);
    await identity(db, seller);
    await assert.rejects(workspace(db), /MFA/);
    await assert.rejects(db.query("select * from private.pricing_analyses"));
    await assert.rejects(
      db.query("select initial_approved_price_cents from public.items"),
    );
    assert.equal(
      (
        await db.query<{ v: Array<{ listed_price_cents: null }> }>(
          "select public.my_priced_items() v",
        )
      ).rows[0].v.find((x: unknown) => typeof x === "object")
        ?.listed_price_cents,
      null,
    );
    await assert.rejects(
      db.query("select public.approve_item_pricing($1,2000)", [id]),
    );
    await identity(db, staff);
    await assert.rejects(
      db.query("select public.admin_publish_item($1,2000)", [id]),
      /Approve/,
    );
    await assert.rejects(
      db.query("select public.admin_finalize_team_item_pricing($1,2000)", [id]),
      /AI Pricing/,
    );
    await db.exec("reset role");
    await db.query("update public.items set inspected_at=null where id=$1", [
      id,
    ]);
    await identity(db, staff);
    await assert.rejects(approve(db), /inspection/);
    await db.exec("reset role");
    await db.query("update public.items set inspected_at=now() where id=$1", [
      id,
    ]);
    await identity(db, staff);
    await assert.rejects(approve(db, 799), /Valid price/);
    const stale = (await workspace(db)).snapshot;
    await approve(db);
    await assert.rejects(
      db.query("select public.admin_approve_item_price($1,$2,2100,$3)", [
        id,
        stale,
        "Stale concurrent decision rejected",
      ]),
      /changed/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{
          listed_price_cents: number;
          locked_seller_commission_bps: number;
        }>(
          "select listed_price_cents,locked_seller_commission_bps from public.items where id=$1",
          [id],
        )
      ).rows[0].locked_seller_commission_bps,
      4500,
    );
    await assert.rejects(
      db.query("update public.items set listed_price_cents=3000 where id=$1", [
        id,
      ]),
      /approval/,
    );
    await assert.rejects(
      db.exec("delete from private.pricing_approvals"),
      /append-only/,
    );
    await assert.rejects(
      db.query(
        "update public.items set initial_approved_price_cents=3000 where id=$1",
        [id],
      ),
      /permanently locked/,
    );
    await db.query("select private.run_rewear_ops_automations()");
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.items where id=$1",
          [id],
        )
      ).rows[0].status,
      "accepted",
    );
    await identity(db, staff);
    await db.query("select public.admin_publish_item($1,2000)", [id]);
    await approve(db, 10000);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ bps: number }>(
          "select locked_seller_commission_bps bps from public.items where id=$1",
          [id],
        )
      ).rows[0].bps,
      4500,
    );
    await assert.rejects(
      db.query("update public.items set brand='Different' where id=$1", [id]),
      /Unpublish/,
    );
    await identity(db, seller);
    const own = (
      await db.query<{
        v: Array<{
          id: string;
          listed_price_cents: number;
          estimated_seller_earnings_cents: number;
        }>;
      }>("select public.my_priced_items() v")
    ).rows[0].v.find((x) => x.id === id)!;
    assert.equal(own.listed_price_cents, 10000);
    assert.equal(own.estimated_seller_earnings_cents, 4500);
    assert.equal("costs" in own, false);
    await identity(db, other);
    assert.deepEqual(
      (await db.query<{ v: unknown[] }>("select public.my_priced_items() v"))
        .rows[0].v,
      [],
    );
  } finally {
    await db.close();
  }
});

test("queue cache, service-only leases, retries and immutable evidence", async () => {
  const db = await pricingFixture();
  try {
    await newItem(db, id);
    await identity(db, staff);
    const request = async () =>
      (
        await db.query<{ id: string }>(
          "select public.admin_request_pricing_analysis($1) id",
          [id],
        )
      ).rows[0].id;
    const job = await request();
    assert.equal(await request(), job);
    await assert.rejects(db.query("select public.claim_pricing_jobs()"));
    await identity(db, staff, "service_role");
    const claim = async () =>
      (
        await db.query<{
          v: Array<{ id: string; input: PricingInput; lease_token: string }>;
        }>("select public.claim_pricing_jobs(10) v")
      ).rows[0].v;
    let jobs = await claim();
    assert.equal(jobs.length, 1);
    assert.equal((await claim()).length, 0);
    await assert.rejects(
      db.query(
        "select public.finish_pricing_job($1,gen_random_uuid(),$2::jsonb)",
        [job, JSON.stringify(analyzePricing(jobs[0].input))],
      ),
      /lease/,
    );
    await db.query("select public.finish_pricing_job($1,$2,null,$3)", [
      job,
      jobs[0].lease_token,
      "simulated_failure",
    ]);
    await db.exec(
      "reset role;update private.pricing_analyses set available_at=now()-interval '1 second'",
    );
    await identity(db, staff, "service_role");
    jobs = await claim();
    await db.query("select public.finish_pricing_job($1,$2,$3::jsonb)", [
      job,
      jobs[0].lease_token,
      JSON.stringify(analyzePricing(jobs[0].input)),
    ]);
    await db.exec("reset role");
    await assert.rejects(
      db.query("update private.pricing_analyses set result='{}'"),
      /immutable/,
    );
    await identity(db, staff);
    await approve(db, 2000, job);
    await assert.rejects(approve(db, 2100, job), /stale/);
  } finally {
    await db.close();
  }
});

test("real checkout, payment, seller credit and refund retain exact paid prices", async () => {
  const db = await pricingFixture();
  try {
    await newItem(db, id);
    await identity(db, staff);
    await approve(db);
    await db.query("select public.admin_publish_item($1,2000)", [id]);
    await identity(db, buyer);
    const order = (
      await db.query<{ id: string }>(
        "select public.prepare_checkout_with_terms($1::uuid[],null,null,'Test Buyer','123 Main Street',null,'Montreal','QC','H1A 1A1','2026-09-25','2026-09-25','2026-09-25') id",
        [[id]],
      )
    ).rows[0].id;
    await identity(db, staff);
    await assert.rejects(approve(db, 2200), /reservation/);
    await db.exec("reset role");
    await assert.rejects(
      db.query("update public.items set listed_price_cents=2200 where id=$1", [
        id,
      ]),
      /Reserved/,
    );
    const payment = await attempt(db, order);
    await identity(db, staff, "service_role");
    await db.query(
      `select public.accept_verified_buyer_payment($1,'pricing-test','pricing-payment',repeat('a',64),$2,'CAD',true)`,
      [payment.id, payment.amount],
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ seller_cents: number }>(
          "select seller_cents from public.order_seller_credits where item_id=$1",
          [id],
        )
      ).rows[0].seller_cents,
      900,
    );
    await identity(db, staff);
    await assert.rejects(approve(db, 2300), /unavailable/);
    await db.exec("reset role");
    await db.query(
      "update public.orders set payment_status='refunded',refunded_at=now() where id=$1",
      [order],
    );
    assert.ok(
      (
        await db.query<{ reversed_at: string }>(
          "select reversed_at from public.order_seller_credits where item_id=$1",
          [id],
        )
      ).rows[0].reversed_at,
    );
    assert.equal(
      (
        await db.query<{ unit_price_cents: number }>(
          "select unit_price_cents from public.order_items where order_id=$1",
          [order],
        )
      ).rows[0].unit_price_cents,
      2000,
    );
  } finally {
    await db.close();
  }
});

test("market evidence invalidation and rule versioning invalidate analysis; reviews never change prices", async () => {
  const db = await pricingFixture();
  try {
    await newItem(db, id);
    await newItem(db, second);
    await identity(db, staff);
    const rules = {
      maxAgeDays: 90,
      minSoldComparables: 3,
      minSimilarityBps: 8000,
      processingCents: null,
      storageCents: null,
      paymentFixedCents: null,
      paymentBps: null,
      minimumProfitCents: null,
      reviewDays: [30, 60, 90],
    };
    await db.query("select public.admin_save_pricing_rules(1,$1::jsonb,$2)", [
      JSON.stringify(rules),
      "Verified test policy for synthetic evidence",
    ]);
    await assert.rejects(
      db.query("select public.admin_save_pricing_rules(1,$1::jsonb,$2)", [
        JSON.stringify(rules),
        "Stale rules update must be rejected",
      ]),
      /changed/,
    );
    await assert.rejects(
      db.query("select public.admin_save_pricing_rules(2,$1::jsonb,$2)", [
        JSON.stringify({ ...rules, reviewDays: [-1] }),
        "Invalid schedule must be rejected",
      ]),
      /Invalid/,
    );
    const c = (
      await db.query<{ v: string }>(
        "select public.admin_add_market_comparable($1,$2::jsonb) v",
        [
          id,
          JSON.stringify({
            source: "Test only",
            url: "https://example.test/listing/1",
            priceCents: 2000,
            currency: "CAD",
            market: "Canada",
            observedAt: "2026-10-01",
            priceType: "listed",
            brand: "Brand",
            category: "women",
            condition: "Good",
            similarityBps: 9000,
            evidence: "Authorized synthetic test observation",
            accessBasis: "manual_authorized",
          }),
        ],
      )
    ).rows[0].v;
    await db.query("select public.admin_invalidate_market_comparable($1,$2)", [
      c,
      "Incorrect comparison found in test review",
    ]);
    await approve(db);
    await db.query("select public.admin_publish_item($1,2000)", [id]);
    await db.exec("reset role");
    await db.query(
      "update public.items set first_published_at=null,published_at=now()-interval '91 days' where id=$1",
      [id],
    );
    // Publication timestamps are immutable in the existing application; emulate the passage of time on test evidence only.
    await db.exec(
      "alter table public.items disable trigger items_keep_first_publication",
    );
    await db.query(
      "update public.items set published_at=now()-interval '91 days' where id=$1",
      [id],
    );
    await db.exec(
      "alter table public.items enable trigger items_keep_first_publication",
    );
    await db.query("select private.run_rewear_ops_automations()");
    await db.query("select private.run_rewear_ops_automations()");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from private.pricing_reviews where item_id=$1",
          [id],
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await db.query<{ price: number }>(
          "select listed_price_cents price from public.items where id=$1",
          [id],
        )
      ).rows[0].price,
      2000,
    );
  } finally {
    await db.close();
  }
});

test("operators can prepare evidence but cannot approve; corrections invalidate approval", async () => {
  const db = await pricingFixture();
  try {
    await newItem(db, id);
    await db.exec(
      `create or replace function public.can_manage_items() returns boolean language sql stable as $$select auth.uid() in ('${staff}'::uuid,'${other}'::uuid)$$`,
    );
    await identity(db, other);
    await workspace(db);
    await assert.rejects(approve(db), /Owner or admin/);
    await identity(db, staff);
    await approve(db);
    await db.query(
      "select public.admin_save_clothing_evidence($1,$2::jsonb,'{\"length\":55}','{}')",
      [
        id,
        JSON.stringify(
          ["front", "back", "size_label"].map((role, n) => ({
            role,
            url: [
              "https://example.test/front",
              "https://example.test/back",
              "https://example.test/label",
            ][n],
          })),
        ),
      ],
    );
    assert.equal((await workspace(db)).item.pricing_approval_id, null);
    await assert.rejects(
      db.query("select public.admin_publish_item($1,2000)", [id]),
      /Approve/,
    );
    await approve(db);
    await db.query("select public.admin_publish_item($1,2000)", [id]);
    await db.exec("reset role");
    await assert.rejects(
      db.query(
        "update public.clothing_listing_evidence set disclosed_defects=array['new defect'] where item_id=$1",
        [id],
      ),
      /Unpublish/,
    );
  } finally {
    await db.close();
  }
});

test("daily request cap, expired worker leases and keyset paging over thousands of items", async () => {
  const db = await pricingFixture();
  try {
    await newItem(db, id);
    for (let n = 0; n < 10; n++) {
      await db.exec("reset role");
      await db.query("update public.items set name=$2 where id=$1", [
        id,
        `Test variant ${n}`,
      ]);
      await identity(db, staff);
      await db.query("select public.admin_request_pricing_analysis($1)", [id]);
    }
    await db.exec("reset role");
    await db.query("update public.items set name='Over limit' where id=$1", [
      id,
    ]);
    await identity(db, staff);
    await assert.rejects(
      db.query("select public.admin_request_pricing_analysis($1)", [id]),
      /Daily/,
    );
    await identity(db, staff, "service_role");
    let jobs = (
      await db.query<{ v: Array<{ id: string; lease_token: string }> }>(
        "select public.claim_pricing_jobs(2) v",
      )
    ).rows[0].v;
    assert.equal(jobs.length, 2);
    await db.exec(
      "reset role;update private.pricing_analyses set lease_until=now()-interval '1 second',attempts=3 where status='running'",
    );
    await identity(db, staff, "service_role");
    await assert.rejects(
      db.query("select public.finish_pricing_job($1,$2,null,$3)", [
        jobs[0].id,
        jobs[0].lease_token,
        "error",
      ]),
      /lease/,
    );
    jobs = (
      await db.query<{ v: Array<{ id: string; lease_token: string }> }>(
        "select public.claim_pricing_jobs(1000) v",
      )
    ).rows[0].v;
    assert.equal(jobs.length, 8);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from private.pricing_analyses where status='failed'",
        )
      ).rows[0].n,
      2,
    );
    await db.query(
      `insert into public.items(id,owner_id,status,seller_pricing_approved_at,listed_price_cents,initial_approved_price_cents,locked_seller_commission_bps,locked_platform_commission_bps)select gen_random_uuid(),$1,'accepted',null,null,2000,null,null from generate_series(1,2500)`,
      [seller],
    );
    await identity(db, staff);
    const first = (
      await db.query<{ v: Array<{ id: string }> }>(
        "select public.admin_pricing_queue() v",
      )
    ).rows[0].v;
    assert.equal(first.length, 50);
    const next = (
      await db.query<{ v: Array<{ id: string }> }>(
        "select public.admin_pricing_queue($1) v",
        [first[49].id],
      )
    ).rows[0].v;
    assert.equal(next.length, 50);
    assert.ok(next.every((r) => !first.some((f) => f.id === r.id)));
  } finally {
    await db.close();
  }
});
