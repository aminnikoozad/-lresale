"use client";

import { useMemo, useState } from "react";
import type { CommissionTier } from "@/lib/business-rules";

type Props = {
  tiers: CommissionTier[];
  processingFeeCents: number;
  minimumItemValueCents: number;
};

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function SellerEarningsCalculator({
  tiers,
  processingFeeCents,
  minimumItemValueCents,
}: Props) {
  const [price, setPrice] = useState(60);

  const result = useMemo(() => {
    const cents = Math.max(0, Math.round((Number(price) || 0) * 100));
    const tier = tiers.find(
      (candidate) => cents >= candidate.minCents && (candidate.maxCents === null || cents <= candidate.maxCents),
    );
    if (!tier) return null;
    const sellerShareCents = Math.round(cents * tier.sellerBps / 10_000);
    return {
      cents,
      sellerBps: tier.sellerBps,
      sellerShareCents,
      conservativeNetCents: Math.max(0, sellerShareCents - processingFeeCents),
    };
  }, [price, processingFeeCents, tiers]);

  return (
    <div className="earnings-calculator">
      <div className="calculator-inputs">
        <label>
          Estimated item sale price
          <div className="money-input"><span>$</span><input type="number" min={minimumItemValueCents / 100} step="1" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></div>
        </label>
      </div>
      {result ? (
        <div className="calculator-result">
          <div><span>Your commission tier</span><b>{result.sellerBps / 100}%</b></div>
          <div><span>Your share from this item</span><b>{cad(result.sellerShareCents)}</b></div>
          <div><span>Batch service fee</span><b>− {cad(processingFeeCents)}</b></div>
          <div className="calculator-total"><span>Conservative example net</span><strong>{cad(result.conservativeNetCents)}</strong></div>
          <small>The {cad(processingFeeCents)} fee is charged once per batch, not once per item, and includes a REWEAR Bag if you request one. This conservative example assumes this is the only item in the batch that sells.</small>
        </div>
      ) : (
        <p className="calculator-warning">Enter an estimated sale price of at least {cad(minimumItemValueCents)} for an individual listing estimate.</p>
      )}
    </div>
  );
}
