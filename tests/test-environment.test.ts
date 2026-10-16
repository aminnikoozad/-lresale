import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveSupabaseConfig, resolveTestSiteOrigin } from "../lib/supabase/config.ts";
import { serviceCredentialReadiness } from "../lib/supabase/service-readiness.ts";

const isolated = { mode: "test", url: "https://synthetic-test.supabase.co", publishableKey: "sb_publishable_synthetic_fixture_only" };
test("test auth callbacks require a separate explicit origin", () => {
  for (const origin of [undefined, "https://shikimomo.com", "https://shikimomo.com.", "https://www.shikimomo.com", "https://lresale.vercel.app", "http://external.example", "https://user:password@test.example", "https://test.example/path"]) {
    assert.throws(() => resolveTestSiteOrigin(origin));
  }
  assert.equal(resolveTestSiteOrigin("https://test.example/"), "https://test.example");
  assert.equal(resolveTestSiteOrigin("http://localhost:3000"), "http://localhost:3000");
  const actions = readFileSync(new URL("../app/auth/actions.ts", import.meta.url), "utf8");
  assert.ok(actions.includes("if (getSupabaseConfig().isTest) return resolveTestSiteOrigin(process.env.TEST_SITE_URL)"));
});
test("test configuration never falls back to production", () => {
  const production = resolveSupabaseConfig({});
  assert.deepEqual(resolveSupabaseConfig({ mode: "production" }), production);
  assert.deepEqual(resolveSupabaseConfig(isolated), { url: isolated.url, publishableKey: isolated.publishableKey, isTest: true });
  for (const env of [
    { mode: "test" }, { ...isolated, url: "" }, { ...isolated, publishableKey: "" },
    { ...isolated, url: production.url }, { ...isolated, publishableKey: production.publishableKey },
    { ...isolated, url: production.url + "." },
    { ...isolated, mode: "typo" }, { ...isolated, url: "http://example.com" },
    { ...isolated, url: "https://user:password@example.com" },
    { ...isolated, url: "https://example.com/path" },
    { ...isolated, url: "https://example.com?project=other" },
    { ...isolated, publishableKey: "sb_secret_never_public" },
  ]) assert.throws(() => resolveSupabaseConfig(env));
  assert.equal(resolveSupabaseConfig({ ...isolated, url: "http://127.0.0.1:54321" }).url, "http://127.0.0.1:54321");
});
test("test privileged clients require an explicitly matching server target", () => {
  const env = { NEXT_PUBLIC_SHIKIMOMO_ENV: "test", SUPABASE_SECRET_KEY: "synthetic-only" };
  assert.equal(serviceCredentialReadiness(env, isolated.url).ready, false);
  assert.equal(serviceCredentialReadiness({ ...env, SUPABASE_URL: resolveSupabaseConfig({}).url }, isolated.url).ready, false);
  assert.equal(serviceCredentialReadiness({ ...env, SUPABASE_URL: isolated.url }, isolated.url).ready, true);
  assert.equal(serviceCredentialReadiness({ SUPABASE_SECRET_KEY: "synthetic-only" }, isolated.url, true).ready, false);
  assert.equal(serviceCredentialReadiness({ SUPABASE_SECRET_KEY: "synthetic-only", SUPABASE_URL: isolated.url }, isolated.url, true).ready, true);
});
test("browser and recovery clients use the same configuration resolver as server clients", () => {
  for (const path of ["lib/supabase/client.ts", "lib/supabase/server.ts", "lib/supabase/public.ts", "lib/supabase/proxy.ts", "app/update-password/recovery-form.tsx"]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.ok(source.includes("getSupabaseConfig()"), path);
    assert.ok(!source.includes("https://lsdhobwrnmlkqnvkamlt.supabase.co"), path);
  }
  const proxy = readFileSync(new URL("../lib/supabase/proxy.ts", import.meta.url), "utf8");
  assert.ok(proxy.includes('status: 503'), "configuration failure must stop middleware processing");
});
