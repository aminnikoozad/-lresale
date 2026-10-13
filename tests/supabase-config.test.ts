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
  for (const url of [testUrl, "http://127.0.0.1:20000", "http://[::1]:32767"]) {
    assert.throws(() => resolveSupabaseConfig({
      url, publishableKey: production.publishableKey, testIsolation: "true",
    }), /refuses the production/);
  }
});

test("explicit isolation allows only canonical literal loopback on native CLI ports", () => {
  for (const host of ["127.0.0.1", "[::1]"]) {
    for (const port of [20000, 20001, 25321, 32766, 32767]) {
      const origin = `http://${host}:${port}`;
      for (const url of [origin, `${origin}/`, `  ${origin}/  `]) {
        assert.deepEqual(resolveSupabaseConfig({ url, publishableKey: testKey, testIsolation: "true" }), {
          url: origin, publishableKey: testKey,
        });
      }
    }
  }
});

test("loopback HTTP requires explicit isolation, complete overrides, and a public key", () => {
  for (const url of ["http://127.0.0.1:20000", "http://[::1]:32767"]) {
    for (const testIsolation of [undefined, "false"]) {
      assert.throws(() => resolveSupabaseConfig({ url, publishableKey: testKey, testIsolation }), /HTTPS origin/);
    }
    for (const publishableKey of [undefined, "", "  "]) {
      assert.throws(() => resolveSupabaseConfig({ url, publishableKey, testIsolation: "true" }), /Set both/);
    }
    for (const publishableKey of ["sb_secret_synthetic", "e30.synthetic.signature", "sb_publishable_"]) {
      assert.throws(() => resolveSupabaseConfig({ url, publishableKey, testIsolation: "true" }), /must be a publishable key/);
    }
  }
});

test("isolation refuses loopback ports outside the native range and ambiguous port syntax", () => {
  for (const host of ["127.0.0.1", "[::1]"]) {
    for (const port of ["", "0", "80", "443", "19999", "32768", "54321", "65535", "65536", "020000", "+20000", "20000.0", "2e4", "0x4e20"]) {
      const url = `http://${host}${port ? `:${port}` : ""}`;
      assert.throws(() => resolveSupabaseConfig({ url, publishableKey: testKey, testIsolation: "true" }), /HTTPS origin/, url);
    }
  }
});

test("isolation refuses DNS names, address aliases, non-loopback addresses, and alternate protocols", () => {
  for (const host of [
    "localhost", "localhost.", "sub.localhost", "127.0.0.1.nip.io", "api.example.test",
    "127.0.0.1.", "127.1", "127.0.1", "2130706433", "0x7f000001", "0177.0.0.1", "%31%32%37.0.0.1",
    "127.0.0.2", "0.0.0.0", "10.0.0.1", "192.168.1.1", "169.254.169.254", "8.8.8.8",
    "[0:0:0:0:0:0:0:1]", "[::ffff:127.0.0.1]", "[::]", "[fe80::1]",
    new URL(testUrl).hostname, new URL(production.url).hostname,
  ]) {
    const url = `http://${host}:20000`;
    assert.throws(() => resolveSupabaseConfig({ url, publishableKey: testKey, testIsolation: "true" }), /HTTPS origin/, url);
  }
  for (const scheme of ["https", "ws", "wss", "ftp", "file"]) {
    for (const host of ["127.0.0.1", "[::1]"]) {
      const url = `${scheme}://${host}:20000`;
      assert.throws(() => resolveSupabaseConfig({ url, publishableKey: testKey, testIsolation: "true" }), /HTTPS origin|canonical/, url);
    }
  }
});

test("loopback trust is checked before URL normalization can erase hostile syntax", () => {
  for (const host of ["127.0.0.1", "[::1]"]) {
    const origin = `http://${host}:20000`;
    const malformed = [
      `${origin}/rest/v1`, `${origin}//`, `${origin}/.`, `${origin}/..`, `${origin}/%2e`,
      `${origin}/a/..`, `${origin}/a/%2e%2e`, `${origin}/?`, `${origin}/#`,
      `${origin}?proxy=production`, `${origin}#fragment`, `${origin}\\`,
      origin.replace("://", "://user:password@"), origin.replace("://", "://@"),
      origin.replace("://", ":///"), origin.replace("://", ":\\\\"),
      origin.replace("://", ":/"), origin.replace(":20000", ":20\n000"),
      origin.replace(":20000", ":20\t000"), `${origin}\u0000`,
    ];
    for (const url of malformed) {
      assert.throws(() => resolveSupabaseConfig({ url, publishableKey: testKey, testIsolation: "true" }), /HTTPS origin/, JSON.stringify(url));
    }
  }
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
    console.log(JSON.stringify({
      skipProxyUrlNormalize: config.skipProxyUrlNormalize,
      images: config.images.remotePatterns,
      imageOptions: { unoptimized: config.images.unoptimized, dangerouslyAllowLocalIP: config.images.dangerouslyAllowLocalIP },
      headers: await config.headers(),
    }));
  `], { env: { ...env, ...overrides }, encoding: "utf8", timeout: 30_000 });
}

test("Next build/startup rejects missing isolated configuration before creating clients", () => {
  const result = loadNextConfig({ NEXT_PUBLIC_SUPABASE_TEST_ISOLATION: "true" });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set both/);
});

test("default and normally configured hosted deployments retain Next URL normalization", () => {
  const configurations: Record<string, string>[] = [
    {},
    { NEXT_PUBLIC_SUPABASE_TEST_ISOLATION: "false" },
    { NEXT_PUBLIC_SUPABASE_URL: testUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: testKey },
    { NEXT_PUBLIC_SUPABASE_URL: testUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: testKey, NEXT_PUBLIC_SUPABASE_TEST_ISOLATION: "false" },
  ];
  for (const overrides of configurations) {
    const result = loadNextConfig(overrides);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).skipProxyUrlNormalize, false);
  }
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
  assert.equal(config.skipProxyUrlNormalize, false);
  assert.deepEqual(config.images, [{
    protocol: "https", hostname: new URL(testUrl).hostname, port: "", pathname: "/storage/v1/object/public/**",
  }]);
  const csp = config.headers[0].headers.find((header: { key: string }) => header.key === "Content-Security-Policy").value;
  assert.ok(csp.includes(`connect-src 'self' ${testUrl} ${testUrl.replace("https:", "wss:")}`));
  assert.ok(csp.includes(`img-src 'self' data: blob: ${testUrl}`));
  assert.equal(csp.includes(production.url), false);
  assert.equal(csp.includes("*.supabase.co"), false);
  assert.ok(csp.includes("upgrade-insecure-requests"));
  assert.deepEqual(config.imageOptions, { unoptimized: false, dangerouslyAllowLocalIP: false });
});

test("isolated native image and websocket policy permits only the selected loopback origin", () => {
  for (const url of ["http://127.0.0.1:20000", "http://[::1]:32767"]) {
    const result = loadNextConfig({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: testKey,
      NEXT_PUBLIC_SUPABASE_TEST_ISOLATION: "true",
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.equal(config.skipProxyUrlNormalize, true);
    assert.deepEqual(config.images, [{
      protocol: "http", hostname: new URL(url).hostname, port: new URL(url).port, pathname: "/storage/v1/object/public/**",
    }]);
    assert.deepEqual(config.imageOptions, { unoptimized: true, dangerouslyAllowLocalIP: false });
    const csp = config.headers[0].headers.find((header: { key: string }) => header.key === "Content-Security-Policy").value;
    const directives = csp.split("; ");
    assert.ok(directives.includes(`connect-src 'self' ${url} ${url.replace("http:", "ws:")} https://challenges.cloudflare.com`));
    assert.ok(directives.includes(`img-src 'self' data: blob: ${url}`));
    assert.equal(csp.includes("upgrade-insecure-requests"), false);
    assert.equal(csp.includes(production.url), false);
    assert.equal(csp.includes("*.supabase.co"), false);
    assert.equal(csp.includes("localhost"), false);
  }
});

test("Next startup cannot enable local HTTP by omitting isolation or choosing a DNS alias", () => {
  for (const [url, testIsolation] of [
    ["http://127.0.0.1:20000", "false"],
    ["http://localhost:20000", "true"],
    ["http://127.0.0.1:32768", "true"],
  ]) {
    const result = loadNextConfig({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: testKey,
      NEXT_PUBLIC_SUPABASE_TEST_ISOLATION: testIsolation,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /HTTPS origin/);
  }
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
