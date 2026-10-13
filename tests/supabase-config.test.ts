import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { resolveSupabaseConfig } from "../lib/supabase/config.ts";

// Synthetic fixtures only. These tests never construct a client or make a
// request to either the production project or an isolated project.
const testUrl = "https://abcdefghijklmnopqrst.supabase.co";
const testKey = "sb_publishable_synthetic_test_fixture";
const production = resolveSupabaseConfig({});

test("existing deployments retain their defaults unless explicitly configured", () => {
  assert.equal(production.url, "https://lsdhobwrnmlkqnvkamlt.supabase.co");
  assert.match(production.publishableKey, /^sb_publishable_/);
  assert.deepEqual(resolveSupabaseConfig({ testIsolation: "false" }), production);
});

test("a complete override uses the same explicit URL and public key", () => {
  for (const testIsolation of [undefined, "false", "true"]) {
    assert.deepEqual(resolveSupabaseConfig({
      url: `  ${testUrl.toUpperCase()}/  `,
      publishableKey: ` ${testKey} `,
      testIsolation,
    }), { url: testUrl, publishableKey: testKey });
  }
});

test("test isolation and partial or empty overrides cannot fall back to production", () => {
  assert.throws(() => resolveSupabaseConfig({ testIsolation: "true" }), /Set both/);
  for (const testIsolation of [undefined, "false", "true"]) {
    for (const override of [
      { url: testUrl },
      { publishableKey: testKey },
      { url: "", publishableKey: testKey },
      { url: testUrl, publishableKey: "  " },
      { url: "", publishableKey: "" },
    ]) {
      assert.throws(() => resolveSupabaseConfig({ ...override, testIsolation }), /Set both/);
    }
  }
});

test("misspelled isolation values fail closed", () => {
  for (const testIsolation of ["", "TRUE", "1", "yes", "test", " true "]) {
    assert.throws(() => resolveSupabaseConfig({ url: testUrl, publishableKey: testKey, testIsolation }), /must be true or false/);
  }
});

test("test isolation refuses the production URL and key independently", () => {
  for (const url of [production.url, `${production.url}/`, production.url.toUpperCase(), `${production.url}:443`]) {
    assert.throws(() => resolveSupabaseConfig({ url, publishableKey: testKey, testIsolation: "true" }), /refuses the production/);
  }
  assert.throws(() => resolveSupabaseConfig({
    url: testUrl, publishableKey: production.publishableKey, testIsolation: "true",
  }), /refuses the production/);
});

test("malformed, insecure, or credential-bearing endpoints are rejected", () => {
  for (const url of [
    "not a URL",
    testUrl.replace("https:", "http:"),
    testUrl.replace("https:", "ftp:"),
    testUrl.replace("://", "://someone:password@"),
    `${testUrl}/rest/v1`,
    `${testUrl}?project=other`,
    `${testUrl}#other`,
  ]) {
    assert.throws(() => resolveSupabaseConfig({ url, publishableKey: testKey }), /HTTPS origin/);
  }
});

test("isolation rejects aliases, custom domains, proxies, and noncanonical project hosts", () => {
  for (const url of [
    "https://localhost:54321",
    "https://127.0.0.1:54321",
    "https://api.example.test",
    `${testUrl}.example.test`,
    `${production.url}.`,
    `${testUrl}:8443`,
    "https://sub.abcdefghijklmnopqrst.supabase.co",
    "https://short.supabase.co",
  ]) {
    assert.throws(() => resolveSupabaseConfig({ url, publishableKey: testKey, testIsolation: "true" }), /canonical/);
  }
});

test("public configuration rejects secret keys, legacy JWTs, and malformed keys without echoing them", () => {
  const serviceRole = `e30.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.synthetic`;
  for (const publishableKey of ["sb_secret_synthetic_do_not_expose", serviceRole, "other-key", "sb_publishable_", "sb_publishable_bad key"]) {
    assert.throws(() => resolveSupabaseConfig({ url: testUrl, publishableKey }), (error: Error) => {
      assert.match(error.message, /must be a publishable key/);
      assert.equal(error.message.includes(publishableKey), false);
      return true;
    });
  }
});

test("all public env reads are statically named for Next.js browser inlining", () => {
  const source = readFileSync(new URL("../lib/supabase/config.ts", import.meta.url), "utf8");
  for (const name of ["URL", "PUBLISHABLE_KEY", "TEST_ISOLATION"]) {
    assert.ok(source.includes(`process.env.NEXT_PUBLIC_SUPABASE_${name}`));
  }
  assert.doesNotMatch(source, /process\.env\[|=\s*process\.env\s*[;,]/);
});

test("browser and password-recovery clients use the shared resolver", () => {
  for (const file of ["../lib/supabase/client.ts", "../app/update-password/recovery-form.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /getSupabaseConfig\(\)/);
    assert.doesNotMatch(source, /\bSUPABASE_URL\b|\bSUPABASE_PUBLISHABLE_KEY\b/);
  }
  const recovery = readFileSync(new URL("../app/update-password/recovery-form.tsx", import.meta.url), "utf8");
  assert.match(recovery, /isSingleton: false/);
  assert.match(recovery, /detectSessionInUrl: false/);
});

function loadNextConfig(overrides: Record<string, string>) {
  const env = { ...process.env };
  for (const name of ["URL", "PUBLISHABLE_KEY", "TEST_ISOLATION"]) {
    delete env[`NEXT_PUBLIC_SUPABASE_${name}`];
  }
  return spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { default: configModule } = await import("next/dist/server/config.js");
    const config = await configModule.default("phase-production-build", process.cwd());
    console.log(JSON.stringify({ images: config.images.remotePatterns, headers: await config.headers() }));
  `], { env: { ...env, ...overrides }, encoding: "utf8", timeout: 30_000 });
}

test("Next build/startup rejects missing isolated configuration before creating clients", () => {
  const result = loadNextConfig({ NEXT_PUBLIC_SUPABASE_TEST_ISOLATION: "true" });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set both/);
});

test("Next image policy and isolated CSP use only the selected test project", () => {
  const result = loadNextConfig({
    NEXT_PUBLIC_SUPABASE_URL: testUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: testKey,
    NEXT_PUBLIC_SUPABASE_TEST_ISOLATION: "true",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.deepEqual(config.images, [{
    protocol: "https", hostname: new URL(testUrl).hostname, port: "", pathname: "/storage/v1/object/public/**",
  }]);
  const csp = config.headers[0].headers.find((header: { key: string }) => header.key === "Content-Security-Policy").value;
  assert.ok(csp.includes(`connect-src 'self' ${testUrl} ${testUrl.replace("https:", "wss:")}`));
  assert.ok(csp.includes(`img-src 'self' data: blob: ${testUrl}`));
  assert.equal(csp.includes(production.url), false);
  assert.equal(csp.includes("*.supabase.co"), false);
});

function loadPostalStorage(testIsolation: string | undefined, keys: Record<string, string> = {}) {
  const source = readFileSync(new URL("../lib/postal-server.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const env = new Proxy({ NEXT_PUBLIC_SUPABASE_TEST_ISOLATION: testIsolation, ...keys }, {
    get(target, name: string) {
      // No real credentials are used. Fail the test if isolated execution even
      // tries to inspect one, before a client or carrier can be contacted.
      if (testIsolation === "true" && /^(SUPABASE_(SECRET|SERVICE_ROLE)_KEY|CANADA_POST_)/.test(name)) {
        throw new Error("Attempted to read a blocked server credential");
      }
      return target[name as keyof typeof target];
    },
  });
  const calls: unknown[][] = [];
  const exports = {} as { postalStorage: () => unknown; postalReadiness: () => { storage: boolean; carrier: boolean; production: boolean } };
  vm.runInNewContext(compiled, {
    exports,
    process: { env },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@/lib/supabase/config") return {
        getSupabaseConfig: () => testIsolation === "true" ? { url: testUrl, publishableKey: testKey } : production,
      };
      if (name === "@supabase/supabase-js") return { createClient: (...args: unknown[]) => { calls.push(args); return "synthetic-client"; } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { ...exports, calls };
}

test("isolated quote storage and expiry cron cannot read inherited keys or create privileged clients", () => {
  const postal = loadPostalStorage("true");
  assert.throws(() => postal.postalStorage(), /Privileged Supabase clients are disabled in test isolation/);
  assert.equal(postal.postalReadiness().storage, false);
  assert.equal(postal.postalReadiness().carrier, false);
  assert.equal(postal.postalReadiness().production, false);
  assert.equal(postal.calls.length, 0);

  for (const path of ["../app/api/cron/expire-checkouts/route.ts", "../app/api/postal/quote/route.ts"]) {
    assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), /postalStorage\(\)/);
  }
  const quote = readFileSync(new URL("../app/api/postal/quote/route.ts", import.meta.url), "utf8");
  assert.ok(quote.indexOf("!ready.storage") < quote.indexOf("await canadaPostRates("));
  const readiness = readFileSync(new URL("../app/admin/readiness/page.tsx", import.meta.url), "utf8");
  assert.match(readiness, /process\.env\.CRON_SECRET\?\.length[^\n]*&& carrier\.storage/);
});

test("normal privileged storage retains key precedence and requires a configured key", () => {
  for (const isolation of [undefined, "false"]) {
    const postal = loadPostalStorage(isolation, {
      SUPABASE_SECRET_KEY: "synthetic-server-key",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-legacy-key",
    });
    assert.equal(postal.postalStorage(), "synthetic-client");
    assert.equal(postal.calls[0][0], production.url);
    assert.equal(postal.calls[0][1], "synthetic-server-key");
    assert.equal(postal.postalReadiness().storage, true);
  }
  const legacy = loadPostalStorage(undefined, { SUPABASE_SERVICE_ROLE_KEY: "synthetic-legacy-key" });
  legacy.postalStorage();
  assert.equal(legacy.calls[0][1], "synthetic-legacy-key");
  assert.throws(() => loadPostalStorage(undefined).postalStorage(), /not configured/);
});
