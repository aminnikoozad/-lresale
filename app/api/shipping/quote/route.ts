import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCanadianPostal, normalizeCanadianPostal } from "@/lib/shipping";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { itemIds?: unknown; postalCode?: unknown };
    const itemIds = Array.isArray(body.itemIds)
      ? [...new Set(body.itemIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 25)
      : [];
    const postalCode = typeof body.postalCode === "string" ? normalizeCanadianPostal(body.postalCode) : "";
    if (!itemIds.length) return NextResponse.json({ status: "invalid_items" }, { status: 400 });
    if (!isCanadianPostal(postalCode)) return NextResponse.json({ status: "invalid_postal" }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("quote_shipping", { item_ids: itemIds, postal_code: postalCode });
    if (error) {
      console.error("[shipping] quote failed", { code: error.code });
      return NextResponse.json({ status: "configuration_error" }, { status: 503 });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "configuration_error" }, { status: 400 });
  }
}
