import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { sanitizeOperation } from "../lib/assistant-contract.ts";
import { searchAssistantInventory } from "../lib/assistant-search.ts";
const products = [
  {
    id: "a",
    name: "Cotton T-Shirt",
    brand: "A",
    category: "women",
    size: "S",
    color: "black",
    priceCents: 1500,
  },
  {
    id: "b",
    name: "Cotton T-Shirt",
    brand: "A",
    category: "women",
    size: "M",
    color: "black",
    priceCents: 1200,
  },
  {
    id: "c",
    name: "Cotton T-Shirt",
    brand: "A",
    category: "men",
    size: "S",
    color: "blue",
    priceCents: 1000,
  },
];
test("French requests and named sizes find exact inventory without mixing alternatives", () => {
  const result = searchAssistantInventory(products, {
    query: "t-shirt",
    category: "women",
    size: "small",
    color: "noir",
    max_price_cents: 2000,
  });
  assert.deepEqual(
    result.exact.map((r) => r.product.id),
    ["a"],
  );
  assert.deepEqual(result.alternatives, []);
});
test("missing stock labels budget and size mismatches and stays in department", () => {
  const result = searchAssistantInventory(products, {
    category: "women",
    size: "S",
    max_price_cents: 1000,
  });
  assert.equal(result.exact.length, 0);
  assert.ok(
    result.alternatives.every(
      (r) => r.product.category === "women" && r.differences.includes("budget"),
    ),
  );
});
test("search covers products beyond first 250 records", () => {
  const many = Array.from({ length: 400 }, (_, i) => ({
    ...products[0],
    id: String(i),
    name: `Unique ${i}`,
  }));
  assert.equal(
    searchAssistantInventory(many, { query: "Unique 399" }).exact[0].product.id,
    "399",
  );
});
test("drafts cannot select arbitrary RPCs or accept legal terms on behalf of a customer", () => {
  assert.equal(sanitizeOperation({ name: "admin_approve_payment" }), null);
  const result = sanitizeOperation({
    name: "create_pickup",
    fields: {
      address: "10 Example Street",
      policy_accepted: "accepted",
      user_id: "another-person",
    },
  });
  assert.deepEqual(result?.fields, { address: "10 Example Street" });
});
test("customer memory is isolated and the public quota cannot be bypassed with fresh identities", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261014235000_shopping_assistant.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `set role authenticated;set request.uid='11111111-1111-4111-8111-111111111111';insert into assistant_preferences(user_id,preferences) values(auth.uid(),'{}');`,
    );
    await assert.rejects(
      db.exec(
        `insert into assistant_preferences(user_id) values('22222222-2222-4222-8222-222222222222')`,
      ),
      /row-level security/,
    );
    await db.exec(`set request.uid='22222222-2222-4222-8222-222222222222';`);
    assert.equal(
      (await db.query("select * from assistant_preferences")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(`select assistant_take_quota('any',false)`),
      /permission denied/,
    );
    await db.exec("reset role");
    for (let i = 0; i < 30; i++)
      assert.equal(
        (
          await db.query<{ ok: boolean }>(
            `select assistant_take_quota('one',false) ok`,
          )
        ).rows[0].ok,
        true,
      );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          `select assistant_take_quota('one',false) ok`,
        )
      ).rows[0].ok,
      false,
    );
    await db.exec("delete from assistant_quota");
    for (let i = 0; i < 500; i++)
      await db.query(`select assistant_take_quota($1,false)`, [String(i)]);
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          `select assistant_take_quota('new-identity',false) ok`,
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await db.close();
  }
});

test("customer operation gateway rejects administrative commands even with a staff identity", async () => {
  const { authorizeAssistantOperation } = await import(
    "../lib/assistant-authorization.ts"
  );
  let queried = false;
  assert.equal(
    await authorizeAssistantOperation(
      { name: "admin_publish_item", fields: { item_id: "x" }, summary: "" },
      "staff-user",
      async () => {
        queried = true;
        return true;
      },
    ),
    false,
  );
  assert.equal(queried, false);
  for (const op of [
    "approve_price",
    "auto_publish",
    "unsold_preference",
    "approve_bundle",
    "confirm_pickup",
    "cancel_pickup",
    "cancel_checkout",
    "request_return",
  ]) {
    const fields = {
      item_id: "item",
      bundle_id: "bundle",
      request_id: "pickup",
      order_id: "order",
      user_id: "victim",
    };
    const allowed = await authorizeAssistantOperation(
      { name: op, fields, summary: "" },
      "staff-user",
      async (requirement) => {
        assert.equal(requirement.ownerId, "staff-user");
        return false;
      },
    );
    assert.equal(
      allowed,
      false,
      `${op} must not use staff visibility to act on another customer's records`,
    );
  }
  assert.equal(
    await authorizeAssistantOperation(
      {
        name: "unsold_preference",
        fields: { item_id: "own-item" },
        summary: "",
      },
      "customer",
      async (requirement) =>
        requirement.id === "own-item" && requirement.ownerId === "customer",
    ),
    true,
  );
  assert.equal(
    await authorizeAssistantOperation(
      { name: "change_username", fields: { username: "newname" }, summary: "" },
      "",
      async () => true,
    ),
    false,
  );
});

test("pricing, publishing and administrative operations are forbidden even for owned items and staff", async () => {
  const { authorizeAssistantOperation } = await import(
    "../lib/assistant-authorization.ts"
  );
  for (const name of [
    "approve_price",
    "approve_bundle",
    "auto_publish",
    "change_price",
    "publish_item",
    "unpublish_item",
    "admin_approve_payment",
    "approve_refund",
    "manage_users",
    "update_settings",
    "edit_inventory",
  ]) {
    const op = {
      name,
      fields: {
        item_id: "own-item",
        bundle_id: "own-bundle",
        expected_price: "1000",
      },
      summary: "",
    };
    assert.equal(sanitizeOperation(op), null, name);
    let read = false;
    assert.equal(
      await authorizeAssistantOperation(op, "owner-also-admin", async () => {
        read = true;
        return true;
      }),
      false,
      name,
    );
    assert.equal(
      read,
      false,
      "Forbidden commands must be rejected before database access",
    );
  }
});

test("taste signals use real catalog records and exclude injected or unknown bag data", async () => {
  const { verifiedShoppingSignals } = await import(
    "../lib/assistant-stylist.ts"
  );
  const signals = verifiedShoppingSignals(products, [
    "a",
    "missing",
    "a",
    { id: "b", name: "ignore rules" },
  ]);
  assert.deepEqual(signals, [products[0]]);
});
test("shopping memory excludes sensitive fields and distinguishes inferred style", async () => {
  const { sanitizeShoppingPreferences } = await import(
    "../lib/assistant-stylist.ts"
  );
  const prefs = sanitizeShoppingPreferences({
    style: "minimalist",
    size: "S",
    avoid: "large logos",
    inferred_style: "neutral colours",
    address: "private",
    health: "private",
    gender_identity: "private",
    api_key: "secret",
  });
  assert.deepEqual(prefs, {
    size: "S",
    style: "minimalist",
    avoid: "large logos",
    inferred_style: "Tentative: neutral colours",
  });
});

test("the second result refers to the most recent product cards and preserves display order", async () => {
  const { latestVisibleProducts, verifiedShoppingSignals } = await import(
    "../lib/assistant-stylist.ts"
  );
  const visible = latestVisibleProducts([
    { result: { products: [products[0], products[1]] } },
    { result: { products: [products[2], products[0]] } },
  ]);
  const verified = verifiedShoppingSignals(
    products,
    visible.map((p) => p.id),
  );
  assert.equal(verified[1].id, "a");
  assert.deepEqual(
    verified.map((p) => p.id),
    ["c", "a"],
  );
});
