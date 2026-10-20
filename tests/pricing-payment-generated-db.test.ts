import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fixture,
  identity,
  attempt,
  buyer,
  staff,
  ids,
} from "./fixtures/buyer-sales-db.ts";
const fix = readFileSync(
  new URL(
    "../supabase/migrations/20261020185852_pricing_payment_generated_earnings_compatibility.sql",
    import.meta.url,
  ),
  "utf8",
);
const oldMigration = readFileSync(
  new URL(
    "../supabase/migrations/20261016030734_buyer_verified_payments.sql",
    import.meta.url,
  ),
  "utf8",
);
const start = oldMigration.indexOf(
  "create or replace function private.sync_paid_order_seller_wallets()",
);
const oldFunction = oldMigration.slice(
  start,
  oldMigration.indexOf("$$;", oldMigration.indexOf("as $$", start)) + 3,
);

test("payment compatibility migration preserves existing paid orders, item snapshots and seller credits", async () => {
  const db = await fixture();
  try {
    await identity(db, buyer);
    const order = (
      await db.query<{ id: string }>(
        "select public.prepare_checkout_with_terms($1::uuid[],null,null,'Synthetic Buyer','123 Test Street',null,'Montreal','QC','H1A 1A1','2026-09-25','2026-09-25','2026-09-25')id",
        [[ids[0]]],
      )
    ).rows[0].id;
    const payment = await attempt(db, order);
    await identity(db, staff, "service_role");
    await db.query(
      "select public.accept_verified_buyer_payment($1,'local-event','local-payment',repeat('a',64),$2,'CAD',true)",
      [payment.id, payment.amount],
    );
    await db.exec("reset role");
    const snapshot = () =>
      db.query(
        `select jsonb_build_object('orders',(select jsonb_agg(to_jsonb(o)order by id)from public.orders o),'lines',(select jsonb_agg(to_jsonb(l)order by id)from public.order_items l),'items',(select jsonb_agg(to_jsonb(i)order by id)from public.items i),'credits',(select jsonb_agg(to_jsonb(c)order by order_item_id)from public.order_seller_credits c),'wallets',(select jsonb_agg(to_jsonb(w)order by id)from public.wallet_transactions w))v`,
      );
    const before = (await snapshot()).rows;
    await db.exec(oldFunction);
    await db.exec(fix);
    assert.deepEqual((await snapshot()).rows, before);
    const columns = await db.query<{ attgenerated: string }>(
      "select attgenerated from pg_attribute where attrelid='public.items'::regclass and attname in('final_seller_earnings_cents','final_platform_earnings_cents')",
    );
    assert.deepEqual(
      columns.rows.map((c) => c.attgenerated),
      ["s", "s"],
    );
  } finally {
    await db.close();
  }
});

test("unexpected newer payment code aborts the entire forward migration without changing it", async () => {
  const db = await fixture();
  try {
    const hash = async () =>
      (
        await db.query<{ v: string }>(
          "select md5(pg_get_functiondef('private.sync_paid_order_seller_wallets()'::regprocedure))v",
        )
      ).rows[0].v;
    const before = await hash();
    await assert.rejects(db.exec(fix), /changed since the audited baseline/);
    await db.exec("rollback");
    assert.equal(await hash(), before);
  } finally {
    await db.close();
  }
});

test("an unexpected earnings-column schema aborts before payment code is replaced", async () => {
  const db = await fixture();
  try {
    await db.exec(oldFunction);
    await db.exec(
      "alter table public.items alter column final_platform_earnings_cents drop expression",
    );
    const before = (
      await db.query(
        "select pg_get_functiondef('private.sync_paid_order_seller_wallets()'::regprocedure)v",
      )
    ).rows;
    await assert.rejects(db.exec(fix), /Expected stored generated/);
    await db.exec("rollback");
    assert.deepEqual(
      (
        await db.query(
          "select pg_get_functiondef('private.sync_paid_order_seller_wallets()'::regprocedure)v",
        )
      ).rows,
      before,
    );
  } finally {
    await db.close();
  }
});
