import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { normalizeCanadianPostalCode, parcelWeightKg, weightClassFor } from "@/lib/shipping";

export const runtime = "nodejs";

type QuoteItem = { id?: string | null };

function xmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp("<(?:\\w+:)?" + tag + "[^>]*>([\\s\\S]*?)</(?:\\w+:)?" + tag + ">", "i"));
  return match?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
}

function parseRates(xml: string) {
  const blocks = xml.match(/<(?:\w+:)?price-quote\b[\s\S]*?<\/(?:\w+:)?price-quote>/gi) ?? [];
  return blocks.map((block) => ({
    serviceCode: xmlValue(block, "service-code"),
    serviceName: xmlValue(block, "service-name"),
    price: Number(xmlValue(block, "due")),
    expectedDeliveryDate: xmlValue(block, "expected-delivery-date") || null,
  })).filter((rate) => rate.serviceCode && Number.isFinite(rate.price) && rate.price >= 0);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { postalCode?: string; city?: string; items?: QuoteItem[] };
    const postalCode = normalizeCanadianPostalCode(String(body.postalCode ?? ""));
    const requestedIds = Array.isArray(body.items) ? [...new Set(body.items.map((item) => String(item?.id ?? "")).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 25) : [];
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postalCode) || !requestedIds.length) {
      return NextResponse.json({ error: "Enter a valid Canadian postal code and at least one item." }, { status: 400 });
    }

    const supabase = createPublicClient();
    const resolved: Array<{ category?: string | null; weightKg?: number | null }> = [];
    for (const id of requestedIds) {
      const { data, error } = await supabase.rpc("catalog_item_detail_v3", { target_item_id: id });
      const product = data?.[0];
      if (error || !product) return NextResponse.json({ error: "One or more items are no longer available." }, { status: 409 });
      let weightKg: number | null = null;
      if (product.category === "home_decor") {
        const home = await supabase.rpc("home_catalog_details", { target_item_id: id });
        const rawWeight = home.data?.[0]?.details?.weight_kg;
        weightKg = typeof rawWeight === "number" && Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : null;
      }
      resolved.push({ category: product.category, weightKg });
    }

    const weightKg = parcelWeightKg(resolved);
    const weightClass = weightClassFor(weightKg);
    const city = String(body.city ?? "").trim().toLowerCase();
    const isMontrealPostalCode = /^H[1-589][A-Z]\d[A-Z]\d$/i.test(postalCode);
    if (["montreal", "montréal"].includes(city) && isMontrealPostalCode) {
      return NextResponse.json({ provider: "REWEAR local", weightKg, weightClass, selected: { serviceName: "Montréal local delivery", priceCents: 0, expectedDeliveryDate: null }, rates: [] });
    }

    const username = process.env.CANADA_POST_API_USERNAME;
    const password = process.env.CANADA_POST_API_PASSWORD;
    const customerNumber = process.env.CANADA_POST_CUSTOMER_NUMBER;
    const originPostalCode = normalizeCanadianPostalCode(process.env.CANADA_POST_ORIGIN_POSTAL_CODE ?? "");
    if (!username || !password || !customerNumber || !/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(originPostalCode)) {
      return NextResponse.json({
        error: "Canada Post live rates are not configured yet.",
        code: "CARRIER_NOT_CONFIGURED",
        weightKg,
        weightClass,
      }, { status: 503 });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mailing-scenario xmlns="http://www.canadapost.ca/ws/ship/rate-v4">
  <customer-number>${customerNumber.replace(/[^0-9]/g, "")}</customer-number>
  <parcel-characteristics><weight>${weightKg.toFixed(2)}</weight></parcel-characteristics>
  <origin-postal-code>${originPostalCode}</origin-postal-code>
  <destination><domestic><postal-code>${postalCode}</postal-code></domestic></destination>
</mailing-scenario>`;

    const response = await fetch("https://soa-gw.canadapost.ca/rs/ship/price", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        Accept: "application/vnd.cpc.ship.rate-v4+xml",
        "Content-Type": "application/vnd.cpc.ship.rate-v4+xml",
        "Accept-Language": "en-CA",
      },
      body: xml,
      cache: "no-store",
    });
    const responseXml = await response.text();
    if (!response.ok) {
      console.error("[shipping] Canada Post rate error", { status: response.status, body: responseXml.slice(0, 800) });
      return NextResponse.json({ error: "Canada Post could not return a live rate. Please try again.", weightKg, weightClass }, { status: 502 });
    }

    const rates = parseRates(responseXml).sort((a, b) => a.price - b.price);
    if (!rates.length) return NextResponse.json({ error: "No Canada Post service is available for this parcel.", weightKg, weightClass }, { status: 422 });
    const selected = rates[0];
    return NextResponse.json({
      provider: "Canada Post",
      weightKg,
      weightClass,
      selected: { ...selected, priceCents: Math.round(selected.price * 100) },
      rates: rates.map((rate) => ({ ...rate, priceCents: Math.round(rate.price * 100) })),
    });
  } catch (error) {
    console.error("[shipping] quote failed", error);
    return NextResponse.json({ error: "Shipping quote could not be calculated." }, { status: 500 });
  }
}
