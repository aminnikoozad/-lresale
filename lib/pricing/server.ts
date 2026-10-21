import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { serviceCredentialReadiness } from "@/lib/supabase/service-readiness";
import { analyzePricing, type PricingInput } from "./engine";

export function pricingWorkerReady() {
  return serviceCredentialReadiness(process.env, getSupabaseConfig().url).ready;
}
export async function processPricingJobs() {
  if (!pricingWorkerReady())
    throw new Error("Pricing worker storage is not configured");
  const storage = createClient(
    getSupabaseConfig().url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await storage.rpc("claim_pricing_jobs", {
    batch_size: 10,
  });
  if (error) throw new Error("Could not claim pricing jobs");
  const jobs = (data ?? []) as Array<{
    id: string;
    lease_token: string;
    input: PricingInput;
  }>;
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    let result: ReturnType<typeof analyzePricing> | null = null;
    let failure: string | null = null;
    try {
      result = analyzePricing(job.input);
    } catch {
      failure = "engine_error";
    }
    const saved = await storage.rpc("finish_pricing_job", {
      target: job.id,
      token: job.lease_token,
      result,
      failure_code: failure,
    });
    if (saved.error || failure) failed++;
    else completed++;
  }
  return { claimed: jobs.length, completed, failed };
}
