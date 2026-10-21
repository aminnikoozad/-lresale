import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processPricingJobs } from "@/lib/pricing/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await processPricingJobs()) });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Pricing worker unavailable" },
      { status: 503 },
    );
  }
}
