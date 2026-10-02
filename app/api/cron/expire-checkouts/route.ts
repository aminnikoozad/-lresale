import { NextResponse } from "next/server";
import { postalStorage } from "@/lib/postal-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { data, error } = await postalStorage().rpc("expire_prepared_checkouts", { p_limit: 200 });
    if (error) {
      console.error("[checkout cleanup] failed", { code: error.code, message: error.message });
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    return NextResponse.json({ ok: true, expiredOrders: data });
  } catch (error) {
    console.error("[checkout cleanup] unavailable", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
