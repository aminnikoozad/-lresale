import { NextResponse } from "next/server";
import { normalizeCanadianPostalCode, parcelWeightKg, weightClassFor } from "@/lib/shipping";

export const runtime = "nodejs";

type QuoteItem = { category?: string | null; weightKg?: number | null };

function xmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp("<(?:\\w+:)?" + tag + "[^>]*>([\\s\\S]*?)</(?:\\w+:)?" + tag + ">", "i"));
  return match?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
}

function parseRates(xml: string) {
  const blocks = xml.match(/<(?:\\w+:)?price-quote\\b[\\s\\S]*?<\\/(?:\\w+:)?price-quote>/gi) ?? [];
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
    const items = Array.isArray(body.items) ? body.items.slice(0, 25) : [];
    if (!/^[A-Z]\\d[A-Z]\\d[A-Z]\\d$/.test(postalCode) || !items.length) {
      return NextResponse.json({ error: "Enter a valid Canadian postal code and at least one item." }, { status: 400 });
    }

    const weightKg = parcelWeightKg(items);
    const weightClass = weightClassFor(weightKg);
    const city = String(body.city ?? "").trim().toLowerCase();
    if (["montreal", "montréal"].includes(city)) {
      return NextResponse.json({ provider: "REWEAR local", weightKg, weightClass, selected: { serviceName: "Montréal local delivery", priceCents: 0, expectedDeliveryDate: null }, rates: [] });
    }

    const username = process.env.CANADA_POST_API_USERNAME;
    const password = process.env.CANADA_POST_API_PASSWORD;
    const customerNumber = process.env.CANADA_POST_CUSTOMER_NUMBER;
    const originPostalCode = normalizeCanadianPostalCode(process.env.CANADA_POST_ORIGIN_POSTAL_CODE ?? "");
    if (!username || !password || !customerNumber || !/^[A-Z]\\d[A-Z]\\d[A-Z]\\d$/.test(originPostalCode)) {
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
