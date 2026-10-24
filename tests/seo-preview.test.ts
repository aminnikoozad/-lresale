import test from "node:test";
import assert from "node:assert/strict";
import { resolveSupabaseEnvironment, productionSupabaseUrl } from "../lib/supabase/environment.ts";

test("SEO preview never uses inherited production Supabase settings", () => {
  const config = resolveSupabaseEnvironment({
    VERCEL_ENV: "preview", NEXT_PUBLIC_APP_ENV: "staging", NEXT_PUBLIC_STAGING_BACKEND: "seo",
    NEXT_PUBLIC_SUPABASE_URL: productionSupabaseUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  });
  assert.equal(config.url, "https://disabled.invalid");
});

test("SEO preview cannot be enabled in production or ordinary development", () => {
  for (const VERCEL_ENV of ["production", "development", undefined]) {
    assert.throws(() => resolveSupabaseEnvironment({ VERCEL_ENV, NEXT_PUBLIC_APP_ENV: "staging", NEXT_PUBLIC_STAGING_BACKEND: "seo" }), /preview-only/);
  }
  assert.throws(() => resolveSupabaseEnvironment({ VERCEL_ENV: "preview", NEXT_PUBLIC_STAGING_BACKEND: "seo" }), /preview-only/);
});

test("ordinary preview still rejects production database reuse", () => {
  assert.throws(() => resolveSupabaseEnvironment({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: productionSupabaseUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example" }), /separate Supabase/);
  assert.equal(resolveSupabaseEnvironment({ VERCEL_ENV: "production" }).url, productionSupabaseUrl);
});
