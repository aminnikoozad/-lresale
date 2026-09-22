import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canadaPostRates } from "@/lib/canada-post";
import { postalReadiness, postalStorage } from "@/lib/postal-server";
import { postalCode, validPostal, validateItemIds, type Parcel } from "@/lib/postal";

export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ status: "login_required" }, 401);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return reply({ status: "unavailable" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ status: "invalid_items" }, 400);
    const body = JSON.parse(raw);
    if (!validateItemIds(body?.itemIds)) return reply({ status: "invalid_items" }, 400);
    if (typeof body.postalCode !== "string" || body.postalCode.length > 10 || !validPostal(body.postalCode)) return reply({ status: "invalid_postal" }, 400);
    const destination = postalCode(body.postalCode);
    const { data: snapshot, error } = await db.rpc("prepare_postal_quote", { p_items: body.itemIds });
    if (error) return reply({ status: "unavailable" }, 503);
    if (snapshot.status !== "ready") return reply({ status: snapshot.status }, snapshot.status === "rate_limited" ? 429 : 200);
    const ready = postalReadiness();
    if (!ready.carrier || !ready.production || !ready.storage) return reply({ status: "not_configured" });
    const customerNumber = process.env.CANADA_POST_CUSTOMER_NUMBER;
    const contractId = process.env.CANADA_POST_CONTRACT_ID;
    if ((customerNumber && !/^\d{1,10}$/.test(customerNumber)) || (contractId && (!customerNumber || !/^\d{1,10}$/.test(contractId)))) return reply({ status: "not_configured" });
    const parcels = snapshot.parcels as Parcel[];
    const rates = await canadaPostRates(parcels, snapshot.origin, destination, { clientId: process.env.CANADA_POST_CLIENT_ID!, clientSecret: process.env.CANADA_POST_CLIENT_SECRET!, customerNumber, contractId });
    if (!rates.length) return reply({ status: "no_services" });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: saved, error: saveError } = await postalStorage().from("postal_quotes").insert({ buyer_id: user.id, item_ids: body.itemIds, destination, snapshot, rates, expires_at: expiresAt }).select("id").single();
    if (saveError || !saved) return reply({ status: "unavailable" }, 503);
    return reply({ status: "ok", quoteId: saved.id, expiresAt, rates, postalCode: destination, packageCount: parcels.length, bands: parcels.map(p => p.band) });
  } catch {
    // No carrier payloads, addresses, tokens or secrets enter logs/browser errors.
    return reply({ status: "unavailable" }, 503);
  }
}
