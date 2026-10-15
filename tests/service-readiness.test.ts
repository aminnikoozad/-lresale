import test from "node:test";
import assert from "node:assert/strict";
import { serviceCredentialReadiness } from "../lib/supabase/service-readiness.ts";

const intended = "https://store.supabase.co";
test("server operations reject conflicting Supabase project settings even when a key exists", () => {
  const key = "private-test-key";
  assert.equal(serviceCredentialReadiness({SUPABASE_SECRET_KEY:key,SUPABASE_URL:"https://other.supabase.co"},intended).ready,false);
  assert.equal(serviceCredentialReadiness({SUPABASE_SECRET_KEY:key,SUPABASE_URL:intended,NEXT_PUBLIC_SUPABASE_URL:"https://other.supabase.co"},intended).ready,false);
  assert.equal(serviceCredentialReadiness({SUPABASE_SECRET_KEY:key,SUPABASE_URL:intended+"/",NEXT_PUBLIC_SUPABASE_URL:intended},intended).ready,true);
  assert.equal(serviceCredentialReadiness({SUPABASE_URL:intended},intended).ready,false);
  assert.equal(serviceCredentialReadiness({SUPABASE_SERVICE_ROLE_KEY:key},intended).ready,true);
  assert.equal(JSON.stringify(serviceCredentialReadiness({SUPABASE_SECRET_KEY:key},intended)).includes(key),false);
});
