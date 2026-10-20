/** Offline rehearsal only: no network client, DSN, service key or production write path. */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
export async function restoreCatalog(path: string) {
  const raw = readFileSync(path, "utf8");
  const s = JSON.parse(raw);
  if (s.formatVersion !== 1) throw new Error("Unsupported catalog snapshot");
  const db = new PGlite({ extensions: { pg_trgm } });
  const run = async (label: string, sql: string) => {
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`${label}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  };
  await run(
    "isolated schemas",
    `set check_function_bodies=off; create extension pg_trgm; create schema auth;create schema storage;create schema private;create schema extensions;create schema net;create schema cron;create schema vault;`,
  );
  for (const r of s.roles)
    await run(
      `role ${r.name}`,
      `create role ${quote(r.name)} ${r.bypassRls ? "bypassrls" : ""};`,
    );
  for (const sql of s.enums) await run("enum", sql);
  for (const sql of s.sequences) await run("sequence", sql);
  for (const f of s.functions.filter((f: { name: string }) =>
    /^auth\.(uid|role|email|jwt)\(/.test(f.name),
  ))
    await run(`auth default ${f.name}`, f.sql);
  for (const t of s.tables) await run(`table ${t.name}`, t.sql);
  for (const f of s.functions) await run(`function ${f.name}`, f.sql);
  for (const c of s.constraints) await run("constraint", c.sql);
  for (const sql of s.views) await run("view", sql);
  for (const sql of s.indexes) await run("index", sql);
  for (const sql of s.triggers) await run("trigger", sql);
  for (const sql of s.policies) await run("policy", sql);
  // Revoke before granting: an explicit empty ACL must not become PostgreSQL's default PUBLIC EXECUTE.
  for (const sql of s.grants.filter((g: string) => g.startsWith("revoke")))
    await run("revoke", sql);
  for (const sql of s.grants.filter((g: string) => !g.startsWith("revoke")))
    await run("grant", sql);
  await run(
    "API schema/sequence access",
    "grant usage on schema public,auth to anon,authenticated,service_role;grant usage,select on all sequences in schema public to authenticated,service_role;",
  );
  for (const t of s.tables) {
    if (t.rls)
      await run(
        `RLS ${t.name}`,
        `alter table ${t.name} enable row level security;`,
      );
    if (t.forceRls)
      await run(
        `force RLS ${t.name}`,
        `alter table ${t.name} force row level security;`,
      );
  }
  for (const r of s.settings)
    await db.query(
      "insert into public.business_setting_versions(setting_key,version,value,effective_at,reason) values($1,$2,$3,$4,$5)",
      [
        r.key,
        r.version,
        JSON.stringify(r.value),
        r.effectiveAt,
        "Offline rehearsal: copied business rules, no customer data",
      ],
    );
  return {
    db,
    snapshotHash: createHash("sha256").update(raw).digest("hex"),
    counts: {
      tables: s.tables.length,
      functions: s.functions.length,
      constraints: s.constraints.length,
      triggers: s.triggers.length,
      policies: s.policies.length,
    },
  };
}

if (process.argv[1]?.endsWith("pricing-schema-rehearsal.ts")) {
  const path = process.argv[2];
  if (!path)
    throw new Error(
      "Pass an offline catalog JSON file. Production connections are not accepted.",
    );
  const { db, ...metadata } = await restoreCatalog(path);
  try {
    const before = (
      await db.query<{ v: unknown }>("select public.get_selling_rules() v")
    ).rows[0].v;
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20261020182321_ai_pricing_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(migration);
    assert.deepEqual(
      (await db.query<{ v: unknown }>("select public.get_selling_rules() v"))
        .rows[0].v,
      before,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from public.items",
        )
      ).rows[0].n,
      0,
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          ...metadata,
          sellingRulesUnchanged: true,
          customerRowsCopied: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}
