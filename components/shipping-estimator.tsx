"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isCanadianPostal, normalizeCanadianPostal, shippingMessage, type ShippingQuote } from "@/lib/shipping";

export function ShippingEstimator({ itemIds, label = "Estimated shipping" }: { itemIds: string[]; label?: string }) {
  const [postal, setPostal] = useState("");
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    const normalized = normalizeCanadianPostal(postal);
    if (!isCanadianPostal(normalized)) {
      setQuote({ status: "invalid_postal" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemIds, postalCode: normalized }),
      });
      const data = await response.json() as ShippingQuote;
      setQuote(data);
    } catch {
      setQuote({ status: "configuration_error" });
    } finally {
      setLoading(false);
    }
  }

  return <div className="shipping-estimator">
    <label>{label}<Input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="A1A 1A1" maxLength={7} autoComplete="postal-code" /></label>
    <Button type="button" variant="outline" onClick={calculate} disabled={loading}>{loading ? "Calculating…" : "Calculate shipping"}</Button>
    {quote ? <p role="status">{quote.status === "ok" ? shippingMessage(quote).replace("Shipping:", "Estimated shipping:") : shippingMessage(quote)}</p> : null}
  </div>;
}
