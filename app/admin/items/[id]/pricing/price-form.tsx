"use client";
import { useState } from "react";
import { estimateEconomics, type PricingInput } from "@/lib/pricing/engine";
import { approvePrice } from "./actions";
const money = (v: number | null) =>
  v === null
    ? "Unknown"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
      }).format(v / 100);
export function PriceForm({
  id,
  snapshot,
  input,
  suggestion,
  analyses,
}: {
  id: string;
  snapshot: string;
  input: PricingInput;
  suggestion: number | null;
  analyses: Array<{ id: string; created_at: string }>;
}) {
  const [price, setPrice] = useState(
    suggestion === null ? "" : (suggestion / 100).toFixed(2),
  );
  const amount = Math.round(Number(price) * 100);
  const economics =
    price !== "" &&
    Number.isSafeInteger(amount) &&
    amount >= 800 &&
    amount <= 100000000
      ? estimateEconomics(amount, input)
      : null;
  return (
    <form action={approvePrice} className="pricing-form">
      <input type="hidden" name="item_id" value={id} />
      <input type="hidden" name="snapshot" value={snapshot} />
      <label>
        Final price (CAD)
        <input
          name="price"
          type="number"
          min="8"
          max="1000000"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </label>
      <dl className="pricing-metrics">
        <div>
          <dt>Seller share</dt>
          <dd>{money(economics?.sellerCents ?? null)}</dd>
        </div>
        <div>
          <dt>Platform revenue</dt>
          <dd>{money(economics?.platformRevenueCents ?? null)}</dd>
        </div>
        <div>
          <dt>Estimated costs</dt>
          <dd>{money(economics?.costCents ?? null)}</dd>
        </div>
        <div>
          <dt>Estimated profit</dt>
          <dd>{money(economics?.profitCents ?? null)}</dd>
        </div>
      </dl>
      {economics?.profitCents == null ? (
        <p className="pricing-warning">
          Profit cannot be assessed until all cost settings are entered. Revenue
          is before operating costs.
        </p>
      ) : economics.uneconomic ? (
        <p className="pricing-warning">
          This price does not meet the configured minimum profit.
        </p>
      ) : null}
      <p>
        Initial approval determines the commission tier. Later price changes
        retain that locked tier. Costs must be allocated per item; estimates
        exclude buyer tax and shipping.
      </p>
      <label>
        Decision basis
        <select name="analysis" defaultValue="">
          <option value="">Manual review</option>
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              Analysis —{" "}
              {new Date(a.created_at).toLocaleString("en-CA", {
                timeZone: "America/Toronto",
              })}
            </option>
          ))}
        </select>
      </label>
      <label>
        Decision / override reason
        <textarea
          name="reason"
          minLength={10}
          maxLength={500}
          required
          placeholder="Explain the chosen price and any departure from the evidence."
        />
      </label>
      <label className="pricing-check">
        <input type="checkbox" name="reviewed" value="yes" required />I reviewed
        the physical inspection, evidence, cost warnings and seller pricing
        mandate.
      </label>
      <button type="submit">Approve final price</button>
    </form>
  );
}
