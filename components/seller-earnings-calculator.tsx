"use client";

import { useMemo, useState } from "react";
import type { CommissionTier } from "@/lib/business-rules";

type Props = {
  tiers: CommissionTier[];
  processingFeeCents: number;
  rewearBagFeeCents: number;
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
  rewearBagFeeCents,
  minimumItemValueCents,
}: Props) {
  const [price, setPrice] = useState(60);
  const [rewearBag, setRewearBag] = useState(false);

  const result = useMemo(() => {
    const cents = Math.max(0, Math.round((Number(price) || 0) * 100));
    const tier = tiers.find(
      (candidate) => cents >= candidate.minCents && (candidate.maxCents === null || cents <= candidate.maxCents),
    );
    if (!tier) return null;
    const sellerShareCents = Math.round(cents * tier.sellerBps / 10_000);
    const batchFeesCents = processingFeeCents + (rewearBag ? rewearBagFeeCents : 0);
    return {
      cents,
      sellerBps: tier.sellerBps,
      sellerShareCents,
      batchFeesCents,
      conservativeNetCents: Math.max(0, sellerShareCents - batchFeesCents),
    };
  }, [price, processingFeeCents, rewearBag, rewearBagFeeCents, tiers]);

  return (
    <div className="earnings-calculator">
      <div className="calculator-inputs">
        <label>
          Estimated item sale price
          <div className="money-input"><span>$</span><input type="number" min={minimumItemValueCents / 100} step="1" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></div>
        </label>
        <label className="calculator-check">
          <input type="checkbox" checked={rewearBag} onChange={(event) => setRewearBag(event.target.checked)} />
          <span>Use a REWEAR Bag ({cad(rewearBagFeeCents)})</span>
        </label>
      </div>
      {result ? (
        <div className="calculator-result">
          <div><span>Your commission tier</span><b>{result.sellerBps / 100}%</b></div>
          <div><span>Your share from this item</span><b>{cad(result.sellerShareCents)}</b></div>
          <div><span>Batch processing fee</span><b>− {cad(processingFeeCents)}</b></div>
          {rewearBag ? <div><span>REWEAR Bag</span><b>− {cad(rewearBagFeeCents)}</b></div> : null}
          <div className="calculator-total"><span>Conservative example net</span><strong>{cad(result.conservativeNetCents)}</strong></div>
          <small>Processing and Bag fees are charged once per batch, not once per item. This conservative example assumes this is the only item in the batch that sells. Actual seller earnings depend on the final sale price and all items sold from the batch.</small>
        </div>
      ) : (
        <p className="calculator-warning">Enter an estimated sale price of at least {cad(minimumItemValueCents)} for an individual listing estimate.</p>
      )}
    </div>
  );
}
