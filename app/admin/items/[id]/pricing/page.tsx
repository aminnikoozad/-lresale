import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Localize } from "@/components/site-language";
import { requireAdmin } from "@/lib/admin-auth";
import { type PricingInput, type analyzePricing } from "@/lib/pricing/engine";
import { pricingWorkerReady } from "@/lib/pricing/server";
import {
  addComparable,
  invalidateComparable,
  requestAnalysis,
  publishApprovedPrice,
  savePricingRules,
} from "./actions";
import { PriceForm } from "./price-form";
import "./pricing.css";
export const dynamic = "force-dynamic";
type Analysis = {
  id: string;
  status: string;
  result: ReturnType<typeof analyzePricing> | null;
  created_at: string;
  error_code: string | null;
  api_cost_micros: number;
};
type Workspace = {
  item: {
    id: string;
    name: string;
    brand: string;
    category: string;
    size: string | null;
    item_condition: string | null;
    inspected_at: string | null;
    photo_urls: string[];
    status: string;
    listed_price_cents: number | null;
    pricing_approval_id: string | null;
  };
  snapshot: string;
  input: PricingInput & { rulesVersion: number };
  canApprove: boolean;
  mandate: boolean;
  comparables: Array<{
    id: string;
    source: string;
    url: string;
    price_cents: number;
    observed_at: string;
    price_type: string;
    brand: string;
    model: string | null;
    condition: string;
    similarity_bps: number;
    evidence: string;
    invalidated_at: string | null;
  }>;
  analyses: Analysis[];
  approvals: Array<{
    id: string;
    price_cents: number;
    approved_at: string;
    reason: string;
    analysis_id: string | null;
  }>;
};
const money = (v: number | null | undefined) =>
  v == null
    ? "Unknown"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
      }).format(v / 100);
const date = (v: string) =>
  new Date(v).toLocaleString("en-CA", { timeZone: "America/Toronto" });
export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; type?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const [{ data, error }, query, performance, controls] = await Promise.all([
    supabase.rpc("admin_pricing_workspace", { target: id }),
    searchParams,
    supabase.rpc("admin_pricing_performance", { target: id }),
    supabase.rpc("admin_pricing_control"),
  ]);
  if (error)
    throw new Error(
      "Pricing workspace unavailable. Apply the pricing migration in this environment and confirm staff MFA.",
    );
  if (!data) notFound();
  const w = data as Workspace;
  const i = w.item;
  const suggestionsEnabled = !controls.error && controls.data?.enabled === true;
  const latest = w.analyses.find((a) => a.status === "completed");
  const result = latest?.result;
  const outcomes = (performance.data ?? []) as Array<{
    order_item_id: string;
    payment_status: string;
    days_to_sale: number | null;
    first_published_price_cents: number | null;
    transaction_cents: number | null;
    seller_cents: number | null;
    platform_revenue_cents: number | null;
    reversed_at: string | null;
  }>;
  return (
    <Localize>
      <main className="pricing-shell">
        <nav className="pricing-nav">
          <Link href="/admin/items">← Items</Link>
          <Link href="/admin/pricing">Pricing queue</Link>
          <Link href={`/admin/items/${id}/pricing`}>Refresh</Link>
        </nav>
        <span className="pricing-tag">SHIKIMOMO · AI PRICING</span>
        <h1>{i.name}</h1>
        <p className="pricing-muted">
          Evidence, economics and a recorded admin decision.
        </p>
        {query.message ? (
          <p
            role="status"
            className={
              query.type === "error" ? "pricing-error" : "pricing-success"
            }
          >
            {query.message}
          </p>
        ) : null}
        <div className="pricing-grid">
          <section className="pricing-card">
            <h2>Item &amp; inspection</h2>
            <p>
              {i.brand || "Brand not recorded"} · {i.category} ·{" "}
              {i.size || "Size not recorded"}
            </p>
            <p>
              Condition: <strong>{i.item_condition || "Not recorded"}</strong>
              <br />
              Status: {i.status}
              <br />
              Physical inspection:{" "}
              {i.inspected_at ? date(i.inspected_at) : "Required"}
              <br />
              Seller pricing mandate:{" "}
              {w.mandate ? "Accepted" : "Required before approval"}
            </p>
            <div className="pricing-photos">
              {i.photo_urls?.map((url, index) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <Image
                    src={url}
                    width={120}
                    height={150}
                    unoptimized
                    alt={`${i.name}, photo ${index + 1}`}
                  />
                </a>
              ))}
            </div>
            <p className="pricing-warning">
              Image recognition is not connected. Use the existing intake and
              physical inspection workflow to verify or correct product details.
            </p>
            <Link href="/admin/items">Open intake / inspection</Link>
          </section>
          <section className="pricing-card">
            <h2>Pricing analysis</h2>
            <dl className="pricing-metrics">
              <div>
                <dt>Suggested price</dt>
                <dd>{money(result?.suggestedCents)}</dd>
              </div>
              <div>
                <dt>Approved price</dt>
                <dd>
                  {i.pricing_approval_id
                    ? money(i.listed_price_cents)
                    : "Pending"}
                </dd>
              </div>
              <div>
                <dt>Sold evidence range (middle 50%)</dt>
                <dd>
                  {result?.marketRange
                    ? `${money(result.marketRange.lowCents)} – ${money(result.marketRange.highCents)}`
                    : "No eligible evidence"}
                </dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{result?.confidence ?? "Not analyzed"}</dd>
              </div>
            </dl>
            {result ? (
              <>
                <p>
                  Eligible sold evidence: {result.marketRange?.count ?? 0}.
                  Listed evidence: {result.listedRange?.count ?? 0}. A
                  calibrated confidence percentage is not available.
                </p>
                {result.listedRange ? (
                  <p>
                    Asking-price range: {money(result.listedRange.lowCents)} –{" "}
                    {money(result.listedRange.highCents)} (not sales).
                  </p>
                ) : null}
                <ul>
                  {result.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                {result.warnings.map((v) => (
                  <p className="pricing-warning" key={v}>
                    {v}
                  </p>
                ))}
                <p className="pricing-muted">
                  Analysis {date(latest!.created_at)} · Rules v
                  {w.input.rulesVersion} now active. Stale analyses are rejected
                  on approval.
                </p>
              </>
            ) : (
              <p>
                No completed analysis yet. Manual approval remains available.
              </p>
            )}
            {!pricingWorkerReady() ? (
              <p className="pricing-warning">
                The background worker needs server credentials in this
                environment. Manual pricing remains available.
              </p>
            ) : null}
            <form action={requestAnalysis}>
              <input type="hidden" name="item_id" value={id} />
              <button disabled={!suggestionsEnabled || !pricingWorkerReady()}>Request analysis</button>
            </form>
            {!suggestionsEnabled ? <p className="pricing-notice">Smart pricing suggestions are off. Manual approval is available. <Link href="/admin/pricing">Pricing controls</Link></p> : null}
            <p className="pricing-muted">
              Identical requests are cached for the UTC day; up to 10 new
              analyses per item per 24 hours. The rules-only engine makes no
              paid AI calls.
            </p>
            {w.analyses.length ? (
              <details>
                <summary>Analysis jobs</summary>
                <ul>
                  {w.analyses.map((a) => (
                    <li key={a.id}>
                      {date(a.created_at)} · {a.status}
                      {a.error_code ? ` · ${a.error_code}` : ""} · API cost CAD{" "}
                      {(a.api_cost_micros / 1000000).toFixed(6)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        </div>
        <section className="pricing-card">
          <h2>Admin decision</h2>
          {w.canApprove ? (
            <PriceForm
              id={id}
              snapshot={w.snapshot}
              input={w.input}
              suggestion={(suggestionsEnabled ? result?.suggestedCents : null) ?? i.listed_price_cents}
              analyses={suggestionsEnabled ? w.analyses.filter((a) => a.status === "completed") : []}
            />
          ) : (
            <p>Only an owner or admin with MFA can approve a final price.</p>
          )}
          {i.pricing_approval_id &&
          !["listed", "sold", "reserved"].includes(i.status) ? (
            <form action={publishApprovedPrice}>
              <input type="hidden" name="item_id" value={id} />
              <input
                type="hidden"
                name="approved_price"
                value={i.listed_price_cents ?? ""}
              />
              <p>Ready for the existing publication checks.</p>
              <button>Publish at approved price</button>
            </form>
          ) : null}
        </section>
        <section className="pricing-card">
          <h2>Market evidence</h2>
          <p>
            Manual, authorized Canadian CAD observations only. No external
            marketplace API is connected.
          </p>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Price / type</th>
                  <th>Observation</th>
                  <th>Match / evidence</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {w.comparables.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <a href={c.url} rel="noreferrer" target="_blank">
                        {c.source}
                      </a>
                    </td>
                    <td>
                      {money(c.price_cents)}
                      <br />
                      {c.price_type}
                    </td>
                    <td>{date(c.observed_at)}</td>
                    <td>
                      {c.brand} · {c.model} · {c.condition}
                      <br />
                      {c.similarity_bps / 100}% operator match
                      <br />
                      {c.evidence}
                    </td>
                    <td>
                      {c.invalidated_at ? (
                        "Invalidated"
                      ) : (
                        <details>
                          <summary>Invalidate</summary>
                          <form
                            className="pricing-form"
                            action={invalidateComparable}
                          >
                            <input type="hidden" name="item_id" value={id} />
                            <input
                              type="hidden"
                              name="comparable_id"
                              value={c.id}
                            />
                            <label>
                              Reason
                              <input
                                name="reason"
                                required
                                minLength={10}
                                maxLength={500}
                              />
                            </label>
                            <button>Invalidate evidence</button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Add authorized evidence</summary>
            <form action={addComparable} className="pricing-form">
              <input type="hidden" name="item_id" value={id} />
              <div className="pricing-form-grid">
                <label>
                  Source
                  <input name="source" required minLength={2} maxLength={100} />
                </label>
                <label>
                  Source URL
                  <input
                    name="url"
                    type="url"
                    pattern="https://.*"
                    maxLength={2000}
                    required
                  />
                </label>
                <label>
                  Observed price (CAD, item only)
                  <input
                    name="price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Price type
                  <select name="price_type">
                    <option value="listed">Listed — asking price</option>
                    <option value="sold">Sold — verified completed sale</option>
                  </select>
                </label>
                <label>
                  Date observed
                  <input name="observed_at" type="date" required />
                </label>
                <label>
                  Brand
                  <input name="brand" required maxLength={100} />
                </label>
                <label>
                  Model
                  <input name="model" maxLength={200} />
                </label>
                <label>
                  Category
                  <input name="category" required defaultValue={i.category} />
                </label>
                <label>
                  Condition
                  <input name="condition" required maxLength={80} />
                </label>
                <label>
                  Operator-assessed similarity (%)
                  <input
                    name="similarity"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    required
                  />
                </label>
              </div>
              <label>
                Evidence and access basis
                <textarea
                  name="evidence"
                  required
                  minLength={10}
                  maxLength={2000}
                  placeholder="Describe the match, Canadian market, item-only CAD amount and evidence that this is a completed sale if marked Sold."
                />
              </label>
              <label className="pricing-check">
                <input name="authorized" type="checkbox" value="yes" required />
                I verified lawful access and this Canadian CAD observation. Sold
                means a documented completed transaction.
              </label>
              <button>Save comparable</button>
            </form>
          </details>
        </section>
        <section className="pricing-card">
          <h2>Decision history</h2>
          {w.approvals.length ? (
            <ol>
              {w.approvals.map((a) => (
                <li key={a.id}>
                  <strong>{money(a.price_cents)}</strong> ·{" "}
                  {date(a.approved_at)} ·{" "}
                  {a.analysis_id ? "Analysis reviewed" : "Manual review"}
                  <p>{a.reason}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>No final price decisions yet.</p>
          )}
        </section>
        <section className="pricing-card">
          <h2>Sale outcomes</h2>
          <p>
            Online sale outcomes read from the existing order and seller-credit
            ledger. Credits are not bank payouts; actual processing costs and
            profit are not yet recorded here.
          </p>
          {performance.error ? (
            <p className="pricing-error">Outcome data could not be loaded.</p>
          ) : outcomes.length ? (
            <div className="pricing-table-wrap">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>First listing</th>
                    <th>Final transaction</th>
                    <th>Days to sale</th>
                    <th>Seller credit</th>
                    <th>Platform revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o) => (
                    <tr key={o.order_item_id}>
                      <td>
                        {o.payment_status}
                        {o.reversed_at ? " · Reversed" : ""}
                      </td>
                      <td>{money(o.first_published_price_cents)}</td>
                      <td>{money(o.transaction_cents)}</td>
                      <td>
                        {o.days_to_sale == null
                          ? "Unknown"
                          : Number(o.days_to_sale).toFixed(1)}
                      </td>
                      <td>{money(o.seller_cents)}</td>
                      <td>{money(o.platform_revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No order outcomes for this item.</p>
          )}
        </section>
        {w.canApprove ? (
          <section className="pricing-card">
            <details>
              <summary>
                Global pricing rules · version {w.input.rulesVersion}
              </summary>
              <p>
                Enter verified eligibility limits and per-item costs. Blank
                means unknown. These settings do not change the CAD 8 floor, CAD
                60 Bag minimum or existing commission rules.
              </p>
              <form className="pricing-form" action={savePricingRules}>
                <input type="hidden" name="item_id" value={id} />
                <input
                  type="hidden"
                  name="version"
                  value={w.input.rulesVersion}
                />
                <div className="pricing-form-grid">
                  {(
                    [
                      ["maxAgeDays", "Maximum evidence age (days)", 1, 730],
                      [
                        "minSoldComparables",
                        "Minimum sold comparables",
                        3,
                        100,
                      ],
                      [
                        "minSimilarityBps",
                        "Minimum match (basis points; 10000 = 100%)",
                        1,
                        10000,
                      ],
                      [
                        "processingCents",
                        "Processing cost per item (CAD cents)",
                        0,
                        100000000,
                      ],
                      [
                        "storageCents",
                        "Expected storage cost per item (CAD cents)",
                        0,
                        100000000,
                      ],
                      [
                        "paymentFixedCents",
                        "Allocated fixed payment cost per item (CAD cents)",
                        0,
                        100000000,
                      ],
                      ["paymentBps", "Payment rate (basis points)", 0, 10000],
                      [
                        "minimumProfitCents",
                        "Minimum platform profit (CAD cents)",
                        0,
                        100000000,
                      ],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        name={key}
                        min={min}
                        max={max}
                        step="1"
                        defaultValue={w.input.rules[key] ?? ""}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Review days, separated by commas
                  <input
                    name="reviewDays"
                    defaultValue={w.input.rules.reviewDays.join(", ")}
                    placeholder="Leave blank until a review schedule is agreed"
                  />
                </label>
                <p>
                  Review days create tasks only. They never discount or publish
                  an item.
                </p>
                <label>
                  Reason and supporting data
                  <textarea
                    name="reason"
                    minLength={10}
                    maxLength={500}
                    required
                  />
                </label>
                <button>Save new rule version</button>
              </form>
            </details>
          </section>
        ) : null}
      </main>
    </Localize>
  );
}
