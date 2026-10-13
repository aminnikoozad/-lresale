import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual Edge handlers with synthetic environment values and a
// client stub. No Supabase requests, credentials, uploads, or MFA changes.
const functions = ["admin-item-photo-upload", "admin-mfa-cleanup"];
const localApp = "http://127.0.0.1:3000";
const localApi = "http://127.0.0.1:20000";
const defaultApp = "https://lresale.vercel.app";
const hostedApi = "https://abcdefghijklmnopqrst.supabase.co";

function loadEdge(name: string, env: Record<string, string | undefined>, forbidKeys = false) {
  const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const clientCalls: unknown[][] = [];
  let handler: ((req: Request) => Promise<Response>) | undefined;
  vm.runInNewContext(compiled, {
    exports: {}, URL, Request, Response, File, console, Uint8Array,
    Deno: {
      env: { get(key: string) {
        if (forbidKeys && /KEY$/.test(key)) throw new Error("Attempted to read blocked credentials");
        return env[key];
      } },
      serve(callback: (req: Request) => Promise<Response>) { handler = callback; },
    },
    require(module: string) {
      if (module === "jsr:@supabase/functions-js/edge-runtime.d.ts") return {};
      if (module === "jsr:@supabase/supabase-js@2") return {
        createClient: (...args: unknown[]) => {
          clientCalls.push(args);
          return { auth: { getUser: async () => ({ data: { user: null }, error: new Error("Synthetic unauthenticated user") }) } };
        },
      };
      throw new Error(`Unexpected import: ${module}`);
    },
  });
  assert.ok(handler, "The real Edge handler must be registered");
  return { handler, clientCalls };
}

function request(origin: string, method = "OPTIONS") {
  return new Request(`${localApi}/functions/v1/synthetic`, {
    method, headers: { origin, authorization: "Bearer synthetic-user-token" },
  });
}

function localEnvironment() {
  return {
    REWEAR_LOCAL_TEST_ISOLATION: "true",
    ALLOWED_APP_ORIGINS: localApp,
    SUPABASE_URL: localApi,
    SUPABASE_ANON_KEY: "synthetic-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
  };
}

for (const name of functions) {
  test(`${name}: ordinary defaults and explicit HTTPS origins do not admit local HTTP`, async () => {
    for (const REWEAR_LOCAL_TEST_ISOLATION of [undefined, "false"]) {
      const env = { ...localEnvironment(), REWEAR_LOCAL_TEST_ISOLATION, SUPABASE_URL: hostedApi, ALLOWED_APP_ORIGINS: undefined };
      const { handler, clientCalls } = loadEdge(name, env);
      const productionResponse = await handler(request(defaultApp));
      assert.equal(productionResponse.status, 200);
      assert.equal(productionResponse.headers.get("access-control-allow-origin"), defaultApp);
      assert.equal((await handler(request(localApp))).status, 403);
      assert.equal(clientCalls.length, 0);

      const explicit = loadEdge(name, { ...env, ALLOWED_APP_ORIGINS: `https://preview.example.test,${localApp}` });
      assert.equal((await explicit.handler(request("https://preview.example.test"))).status, 200);
      assert.equal((await explicit.handler(request(localApp))).status, 403);
      assert.equal((await explicit.handler(request(defaultApp))).status, 403);
    }
  });

  test(`${name}: local mode admits exactly the fixed local app and preserves authentication`, async () => {
    const { handler, clientCalls } = loadEdge(name, localEnvironment());
    const preflight = await handler(request(localApp));
    assert.equal(preflight.status, 200);
    assert.equal(preflight.headers.get("access-control-allow-origin"), localApp);
    assert.equal(preflight.headers.get("vary"), "Origin");
    assert.equal(clientCalls.length, 0);
    for (const origin of [
      defaultApp, "https://preview.example.test", "http://localhost:3000", "http://127.0.0.1:3001",
      "http://127.1:3000", "http://2130706433:3000", "http://[::1]:3000", `${localApp}/`, "null",
    ]) {
      const response = await handler(request(origin, "POST"));
      assert.equal(response.status, 403, origin);
      assert.equal(response.headers.get("access-control-allow-origin"), null, origin);
    }
    assert.equal(clientCalls.length, 0);
    const unauthenticated = await handler(request(localApp, "POST"));
    assert.equal(unauthenticated.status, 401);
    assert.equal(clientCalls.length, 1, "Origin permission must not bypass user authentication or create a service client");
    assert.equal(clientCalls[0][0], localApi);
    assert.equal(clientCalls[0][1], "synthetic-anon-key");
  });

  test(`${name}: literal native API endpoints include the configured port and range boundaries`, async () => {
    for (const SUPABASE_URL of [
      "http://127.0.0.1:20000", "http://127.0.0.1:28630", "http://127.0.0.1:32767/",
      "http://[::1]:20000", "http://[::1]:32767",
    ]) {
      const { handler, clientCalls } = loadEdge(name, { ...localEnvironment(), SUPABASE_URL });
      assert.equal((await handler(request(localApp))).status, 200);
      assert.equal(clientCalls.length, 0);
    }
  });

  test(`${name}: local mode rejects missing, mixed, or disguised app origins before reading credentials`, () => {
    for (const ALLOWED_APP_ORIGINS of [
      undefined, "", defaultApp, `${localApp},${defaultApp}`, `${localApp},`,
      "http://localhost:3000", "http://127.1:3000", "http://127.0.0.1:03000", `${localApp}/`,
      `${localApp}/..`, `${localApp}?`, `${localApp}#`, "http://user@127.0.0.1:3000",
    ]) {
      assert.throws(() => loadEdge(name, { ...localEnvironment(), ALLOWED_APP_ORIGINS }, true), /Local test isolation requires/, String(ALLOWED_APP_ORIGINS));
    }
  });

  test(`${name}: local mode rejects hosted, ambiguous, and out-of-range API targets before reading credentials`, () => {
    for (const SUPABASE_URL of [
      undefined, "", hostedApi, "https://lsdhobwrnmlkqnvkamlt.supabase.co", "http://localhost:20000",
      "http://127.1:20000", "http://2130706433:20000", "http://0x7f000001:20000", "http://127.0.0.1:020000",
      "http://127.0.0.1:19999", "http://127.0.0.1:32768", "http://127.0.0.1:54321",
      `${localApi}/..`, `${localApi}?`, `${localApi}#`, "http://user@127.0.0.1:20000",
    ]) {
      assert.throws(() => loadEdge(name, { ...localEnvironment(), SUPABASE_URL }, true), /Local test isolation requires/, String(SUPABASE_URL));
    }
  });

  test(`${name}: misspelled local isolation flags fail closed before reading credentials`, () => {
    for (const REWEAR_LOCAL_TEST_ISOLATION of ["", "TRUE", "1", "yes", " true "]) {
      assert.throws(() => loadEdge(name, { ...localEnvironment(), REWEAR_LOCAL_TEST_ISOLATION }, true), /REWEAR_LOCAL_TEST_ISOLATION must be true or false/);
    }
  });
}
