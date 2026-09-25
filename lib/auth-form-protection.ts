import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BUILD_ADMIN_RATE_LIMIT_SALT } from "@/lib/generated/admin-rate-limit-salt";
import { verifyHumanChallenge } from "@/lib/human-challenge";
import { createClient } from "@/lib/supabase/server";

// This limiter supplements Supabase Auth and CAPTCHA. Edge/firewall protection is still recommended for volumetric DDoS.
export async function protectAuthForm(form: FormData, path: string) {
  const fail = (message: string) => redirect(`${path}?message=${encodeURIComponent(message)}`);

  // Cheap honeypot rejection happens before any database work.
  if (String(form.get("website") || "").trim()) fail("Verification failed. Please try again.");

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")?.trim()
    || "unknown";
  const salt = process.env.ADMIN_RATE_LIMIT_SALT || BUILD_ADMIN_RATE_LIMIT_SALT;
  // Path + IP prevents rotating emails from bypassing the limiter while keeping signup/login/recovery buckets separate.
  const key = createHmac("sha256", salt).update(`public-auth:${path}:${ip}`).digest("hex");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_auth_form_attempt", { p_rate_key: key });
  if (error || data?.allowed !== true) {
    fail("Too many attempts or protection unavailable. Please wait and try again.");
  }

  const challengeToken = String(form.get("human_challenge") || "");
  const challengeAnswer = String(form.get("human_answer") || "");
  if (!verifyHumanChallenge(challengeToken, challengeAnswer)) {
    fail("Complete the human check and try again.");
  }

  const captchaToken = String(form.get("captcha_token") || "");
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captchaToken) {
    fail("Complete the anti-bot verification and try again.");
  }

  return captchaToken || undefined;
}
