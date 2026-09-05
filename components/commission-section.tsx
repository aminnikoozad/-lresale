import { createClient } from "@/lib/supabase/server";
import {
  formatCadFromCents,
  loadSellingRules,
  tierPriceLabel,
} from "@/lib/business-rules";

export async function CommissionSection() {
  const supabase = await createClient();
  const rules = await loadSellingRules(supabase);

  return (
    <section
      className="commission-section section-wrap"
      aria-labelledby="commission-title"
    >
      <div className="commission-heading">
        <p className="eyebrow dark">Simple, transparent commission</p>
        <h2 id="commission-title">
          The more your item is worth, the more you keep.
        </h2>
      </div>
      <div className="commission-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Initial approved item price</th>
              <th scope="col">You receive</th>
              <th scope="col">Platform commission</th>
            </tr>
          </thead>
          <tbody>
            {rules.commissionTiers.map((tier) => (
              <tr key={`${tier.minCents}-${tier.maxCents ?? "plus"}`}>
                <th scope="row">{tierPriceLabel(tier)}</th>
                <td>{tier.sellerBps / 100}%</td>
                <td>{tier.platformBps / 100}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="commission-explanation">
        Your commission rate is determined by the item’s initial approved
        listing price and remains locked even if the selling price is later
        reduced. Seller earnings are calculated from the final item sale price
        only; GST, QST, shipping, delivery and other buyer-facing charges are
        excluded.
      </p>
      <p className="commission-minimum">
        <strong>
          Items under {formatCadFromCents(rules.minimumIndividualItemValueCents)}:
        </strong>{" "}
        Lower-value items are not normally accepted as individual listings
        {rules.bundleEligibility
          ? ", but suitable items may be combined with other eligible items and sold as a bundle."
          : "."}
      </p>
    </section>
  );
}
