import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadSellingRules } from "@/lib/business-rules";
import { updateSellingRules } from "./actions";
import "./settings.css";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function dollars(cents: number) {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

function percent(bps: number) {
  return (bps / 100).toString();
}

export default async function SellingRulesPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: canManage, error: permissionError }, rules, params] = await Promise.all([
    supabase.rpc("can_manage_selling_rules"),
    loadSellingRules(supabase),
    searchParams,
  ]);

  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "error" ? "error" : "success";
  const editable = !permissionError && Boolean(canManage);
  const tiers = [...rules.commissionTiers].sort((a, b) => a.minCents - b.minCents);

  return (
    <main className="admin-settings-shell">
      <header className="admin-settings-top">
        <div>
          <Link href="/" className="brand">REWEAR<span>.</span></Link>
          <span className="admin-pill">Admin</span>
        </div>
        <Link href="/account">Customer account</Link>
      </header>

      <section className="admin-settings-wrap">
        <div className="admin-settings-heading">
          <div>
            <p className="eyebrow dark">Admin → Settings → Selling Rules</p>
            <h1>Selling Rules</h1>
            <p>Manage item minimums, commission tiers, bundles, pickup pricing and operational resale rules without editing code.</p>
          </div>
          <div className={`admin-access ${editable ? "ok" : "blocked"}`}>
            <strong>{editable ? "Authorized" : "Read-only / not configured"}</strong>
            <span>{user.email}</span>
          </div>
        </div>

        {message ? <div className={`settings-message ${type}`}>{message}</div> : null}
        {permissionError ? (
          <div className="settings-message warning">
            The production selling-rules migration has not been applied yet. Current default rules are shown below, but saving is disabled until the Supabase migration and Owner/Admin role are configured.
          </div>
        ) : null}
        {!permissionError && !editable ? (
          <div className="settings-message warning">
            Your account is signed in but does not currently have Owner or Selling Rules Admin permission.
          </div>
        ) : null}

        <form action={updateSellingRules} className="selling-rules-form">
          <fieldset disabled={!editable}>
            <section className="settings-card">
              <div className="settings-card-title">
                <h2>Core selling values</h2>
                <p>These values control individual item acceptance and the lowest value allowed for a standard pickup request.</p>
              </div>
              <div className="settings-grid three">
                <label>Minimum individual item value (CAD)
                  <input name="minimum_item_value" type="number" min="0.01" step="0.01" defaultValue={dollars(rules.minimumIndividualItemValueCents)} required />
                </label>
                <label>Minimum standard pickup request value (CAD)
                  <input name="minimum_pickup_value" type="number" min="0.01" step="0.01" defaultValue={dollars(rules.minimumPickupEstimatedValueCents)} required />
                </label>
                <label>Minimum selling price (CAD)
                  <input name="minimum_selling_price" type="number" min="0" step="0.01" defaultValue={dollars(rules.minimumSellingPriceCents)} required />
                </label>
              </div>
              <label className="settings-check">
                <input type="checkbox" name="bundle_eligibility" value="enabled" defaultChecked={rules.bundleEligibility} />
                Allow suitable lower-value items to be combined into bundles.
              </label>
            </section>

            <section className="settings-card">
              <div className="settings-card-title">
                <h2>Pickup pricing</h2>
                <p>Current policy: collections at or above the threshold are free and can receive priority handling. Lower-value standard pickups are charged per item. Bag / Box requests have their own minimum.</p>
              </div>
              <div className="settings-grid three">
                <label>Free priority pickup threshold (CAD)
                  <input name="free_pickup_threshold" type="number" min="0.01" step="0.01" defaultValue={dollars(rules.pickupRules.freePickupThresholdCents)} required />
                </label>
                <label>Pickup fee per item below threshold (CAD)
                  <input name="low_value_pickup_item_fee" type="number" min="0" step="0.01" defaultValue={dollars(rules.pickupRules.lowValuePickupItemFeeCents)} required />
                </label>
                <label>Bag / Box minimum estimated value (CAD)
                  <input name="bag_minimum_value" type="number" min="0.01" step="0.01" defaultValue={dollars(rules.pickupRules.bagMinimumEstimatedValueCents)} required />
                </label>
              </div>
              <label className="settings-check">
                <input type="checkbox" name="priority_pickup_enabled" value="enabled" defaultChecked={rules.pickupRules.priorityPickupAtOrAboveThreshold} />
                Mark pickup requests at or above the free-pickup threshold as priority.
              </label>
              <p><strong>Current customer rule:</strong> {dollars(rules.pickupRules.freePickupThresholdCents)} CAD or more = free priority pickup. Below that = {dollars(rules.pickupRules.lowValuePickupItemFeeCents)} CAD per item. Bag / Box requests require {dollars(rules.pickupRules.bagMinimumEstimatedValueCents)} CAD or more.</p>
            </section>

            <section className="settings-card">
              <div className="settings-card-title">
                <h2>Commission tiers</h2>
                <p>Commission locks permanently when the seller approves the initial listing price. Later discounts do not change the locked percentage.</p>
              </div>
              <div className="tier-table">
                <div className="tier-row tier-head">
                  <span>Minimum CAD</span><span>Maximum CAD</span><span>Seller %</span><span>Platform %</span>
                </div>
                {[0, 1, 2, 3].map((index) => {
                  const tier = tiers[index] ?? tiers.at(-1)!;
                  return (
                    <div className="tier-row" key={index}>
                      <input aria-label={`Tier ${index + 1} minimum`} name={`tier_${index + 1}_min`} type="number" min="0" step="0.01" defaultValue={dollars(tier.minCents)} required />
                      <input aria-label={`Tier ${index + 1} maximum`} name={`tier_${index + 1}_max`} type="number" min="0" step="0.01" defaultValue={tier.maxCents === null ? "" : dollars(tier.maxCents)} placeholder={index === 3 ? "No maximum" : ""} />
                      <input aria-label={`Tier ${index + 1} seller percent`} name={`tier_${index + 1}_seller`} type="number" min="0" max="100" step="0.01" defaultValue={percent(tier.sellerBps)} required />
                      <output>{percent(tier.platformBps)}%</output>
                    </div>
                  );
                })}
              </div>
              <small>The final tier must have no maximum. Platform commission is automatically calculated as 100% minus the seller share.</small>
            </section>

            <section className="settings-card">
              <div className="settings-card-title">
                <h2>Operational rules</h2>
                <p>Configure the default selling period and operational thresholds.</p>
              </div>
              <div className="settings-grid three">
                <label>Selling period (days)
                  <input name="selling_period_days" type="number" min="1" max="3650" step="1" defaultValue={rules.sellingPeriodDays} required />
                </label>
                <label>High-value item threshold (CAD)
                  <input name="high_value_threshold" type="number" min="0" step="0.01" defaultValue={dollars(rules.highValueThresholdCents)} required />
                </label>
                <label>Return period (days, optional)
                  <input name="return_period_days" type="number" min="1" max="3650" step="1" defaultValue={rules.returnPeriodDays ?? ""} />
                </label>
                <label>Second missed pickup fee (CAD)
                  <input name="second_missed_pickup_fee" type="number" min="0" step="0.01" defaultValue={dollars(rules.pickupRules.secondMissedPickupFeeCents)} required />
                </label>
                <label>Suspend free pickup after missed pickups
                  <input name="suspend_after_misses" type="number" min="1" max="99" step="1" defaultValue={rules.pickupRules.suspendFreePickupAfterMisses} required />
                </label>
                <label>Store credit bonus (%)
                  <input name="store_credit_bonus_percent" type="number" min="0" max="100" step="0.01" defaultValue={percent(rules.storeCreditBonusBps)} required />
                </label>
              </div>
              <label className="settings-check">
                <input type="checkbox" name="pickup_confirmation_required" value="enabled" defaultChecked={rules.pickupRules.confirmationRequired} />
                Require customer confirmation before a pickup is placed on the driver route.
              </label>
            </section>

            <section className="settings-card">
              <div className="settings-card-title">
                <h2>Discount schedule</h2>
                <p>Optional configurable markdown schedule. Percentages are stored as basis points so pricing logic remains precise.</p>
              </div>
              <label>Schedule JSON
                <textarea name="discount_schedule" rows={5} defaultValue={JSON.stringify(rules.discountSchedule, null, 2)} placeholder={'[{"startDay":31,"discountBps":1000}]'} />
              </label>
            </section>

            <section className="settings-card publish-card">
              <div>
                <h2>Publish a new rules version</h2>
                <p>Every change is immutable, versioned and written to the Audit Log. Previously locked item commissions are never recalculated.</p>
              </div>
              <div className="settings-grid two">
                <label>Effective date/time (optional)
                  <input name="effective_at" type="datetime-local" />
                </label>
                <label>Reason for change
                  <input name="reason" type="text" minLength={3} maxLength={500} placeholder="Example: Update pickup pricing for pilot economics" required />
                </label>
              </div>
              <label className="settings-check confirm">
                <input type="checkbox" name="confirm_change" value="accepted" required />
                I confirm this creates a new business-rules version and may affect future pickup requests, future item approvals and future commission locks.
              </label>
              <button type="submit" className="save-rules">Save new rules version</button>
            </section>
          </fieldset>
        </form>
      </section>
    </main>
  );
}
