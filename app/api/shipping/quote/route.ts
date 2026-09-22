import { NextResponse } from "next/server";

// Retire the XML/category-estimate endpoint. Refreshed checkout uses /api/postal/quote.
export async function POST() {
  return NextResponse.json({ error: "Shipping has been updated. Refresh checkout and calculate a new postal quote.", status: "expired" }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
