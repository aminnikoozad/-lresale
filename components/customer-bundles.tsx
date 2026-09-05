import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  commissionTierForInitialPrice,
  loadSellingRules,
} from "@/lib/business-rules";
import { earningsFromSalePrice } from "@/lib/commission";
import { approveBundlePricing } from "@/app/account/actions";

function money(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function CustomerBundles() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [bundleResult, membershipResult, rules] = await Promise.all([
    supabase
      .from("bundles")
      .select(
        "id,title,status,initial_approved_price_cents,listed_price_cents,sold_price_cents,locked_seller_commission_bps,locked_platform_commission_bps,seller_pricing_approved_at,created_at",
      )
      .order("created_at", { ascending: false }),
    supabase.from("bundle_items").select("bundle_id,item_id"),
    loadSellingRules(supabase),
  ]);

  if (bundleResult.error || membershipResult.error || !bundleResult.data?.length) return null;

  const membershipCount = new Map<string, number>();
  for (const membership of membershipResult.data ?? []) {
    membershipCount.set(
      membership.bundle_id,
      (membershipCount.get(membership.bundle_id) ?? 0) + 1,
    );
  }

  return (
    <section className="account-panel" style={{ marginTop: 20 }}>
      <div className="panel-title">
        <div>
          <h2>Your bundles</h2>
          <p>
            Lower-value eligible items may be grouped into one sellable bundle.
            Review the bundle price and commission before it goes live.
          </p>
        </div>
      </div>
      <div className="seller-items">
        {bundleResult.data.map((bundle) => {
          const initialPrice = bundle.initial_approved_price_cents ?? 0;
          let previewSellerBps = bundle.locked_seller_commission_bps;
          let previewPlatformBps = bundle.locked_platform_commission_bps;
          if (initialPrice > 0 && previewSellerBps == null) {
            try {
              const tier = commissionTierForInitialPrice(initialPrice, rules);
              previewSellerBps = tier.sellerBps;
              previewPlatformBps = tier.platformBps;
            } catch {
              previewSellerBps = null;
              previewPlatformBps = null;
            }
          }
          const currentPrice = bundle.listed_price_cents ?? bundle.initial_approved_price_cents;
          const estimated =
            currentPrice != null && previewSellerBps != null
              ? earningsFromSalePrice(currentPrice, previewSellerBps).sellerEarningsCents
              : null;
          const finalEarnings =
            bundle.sold_price_cents != null && bundle.locked_seller_commission_bps != null
              ? earningsFromSalePrice(bundle.sold_price_cents, bundle.locked_seller_commission_bps)
                  .sellerEarningsCents
              : null;
          const requiresApproval =
            bundle.status === "waiting_for_seller_approval" &&
            bundle.initial_approved_price_cents != null &&
            !bundle.seller_pricing_approved_at;

          return (
            <article
              className={`seller-item ${requiresApproval ? "needs-approval" : ""}`}
              key={bundle.id}
            >
              <header>
                <div>
                  <h3>{bundle.title}</h3>
                  <span>
                    {titleCase(bundle.status)} · {membershipCount.get(bundle.id) ?? 0} items
                  </span>
                </div>
                {requiresApproval ? <b>Approval needed</b> : null}
              </header>
              <dl>
                <div>
                  <dt>Initial approved price</dt>
                  <dd>{bundle.initial_approved_price_cents != null ? money(bundle.initial_approved_price_cents) : "Pending"}</dd>
                </div>
                <div>
                  <dt>Current selling price</dt>
                  <dd>{currentPrice != null ? money(currentPrice) : "Pending"}</dd>
                </div>
                <div>
                  <dt>Your share</dt>
                  <dd>{previewSellerBps != null ? `${previewSellerBps / 100}%` : "Pending"}</dd>
                </div>
                <div>
                  <dt>Platform commission</dt>
                  <dd>{previewPlatformBps != null ? `${previewPlatformBps / 100}%` : "Pending"}</dd>
                </div>
                <div>
                  <dt>Estimated earnings</dt>
                  <dd>{estimated != null ? money(estimated) : "Pending"}</dd>
                </div>
                <div>
                  <dt>Final earnings after sale</dt>
                  <dd>{finalEarnings != null ? money(finalEarnings) : "—"}</dd>
                </div>
              </dl>
              {requiresApproval ? (
                <div className="pricing-approval">
                  <p>
                    By approving, you accept this bundle’s initial price and
                    commission. The percentage remains locked even if the bundle
                    is discounted later.
                  </p>
                  <form action={approveBundlePricing}>
                    <input type="hidden" name="bundle_id" value={bundle.id} />
                    <input type="hidden" name="expected_price" value={bundle.initial_approved_price_cents ?? 0} />
                    <Button type="submit">Approve bundle price &amp; commission</Button>
                  </form>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
