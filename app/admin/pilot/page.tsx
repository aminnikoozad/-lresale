import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { PILOT_MODE } from "@/lib/catalog-taxonomy";
import {
  PILOT_TARGETS,
  type PilotSnapshot,
  formatCad,
  formatPercent,
  pilotSignal,
} from "@/lib/pilot-metrics";
import { addPilotCost } from "./actions";
import "./pilot.css";
import "../operations/operations.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type CostEntry = {
  id: string;
  occurred_at: string;
  category: string;
  amount_cents: number;
  labor_minutes: number;
  hourly_cost_cents: number;
  note: string | null;
};

function signalClass(signal: ReturnType<typeof pilotSignal>) {
  return signal === "met" ? "pilot-met" : signal === "watch" ? "pilot-watch" : "pilot-not-yet";
}

function localDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "medium" }).format(new Date(value));
}

export default async function PilotDashboard({ searchParams }: Props) {
  const { supabase, access } = await requireAdmin();
  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "error" ? "error" : "success";

  const [{ data: snapshotData, error: snapshotError }, { data: costs, error: costsError }] = await Promise.all([
    supabase.rpc("admin_pilot_snapshot"),
    supabase
      .from("pilot_cost_entries")
      .select("id,occurred_at,category,amount_cents,labor_minutes,hourly_cost_cents,note")
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  const snapshot = snapshotError ? null : (snapshotData as PilotSnapshot | null);
  const costRows = costsError ? [] : ((costs ?? []) as CostEntry[]);
  const databaseReady = Boolean(snapshot && !snapshotError && !costsError);

  const metrics = snapshot
    ? [
        { label: "Accepted items", value: snapshot.accepted_items.toString(), target: `${PILOT_TARGETS.acceptedItems}`, signal: pilotSignal(snapshot.accepted_items, PILOT_TARGETS.acceptedItems) },
        { label: "Listed items", value: snapshot.listed_items.toString(), target: `${PILOT_TARGETS.listedItems}`, signal: pilotSignal(snapshot.listed_items, PILOT_TARGETS.listedItems) },
        { label: "Sell-through", value: formatPercent(snapshot.sell_through_bps), target: `≥ ${formatPercent(PILOT_TARGETS.sellThroughBps)}`, signal: pilotSignal(snapshot.sell_through_bps, PILOT_TARGETS.sellThroughBps) },
        { label: "Average sale", value: formatCad(snapshot.average_sale_price_cents), target: `≥ ${formatCad(PILOT_TARGETS.averageSalePriceCents)}`, signal: pilotSignal(snapshot.average_sale_price_cents, PILOT_TARGETS.averageSalePriceCents) },
        { label: "Real sellers", value: snapshot.real_sellers.toString(), target: `≥ ${PILOT_TARGETS.realSellers}`, signal: pilotSignal(snapshot.real_sellers, PILOT_TARGETS.realSellers) },
        { label: "Repeat seller rate", value: formatPercent(snapshot.repeat_seller_rate_bps), target: `≥ ${formatPercent(PILOT_TARGETS.repeatSellerRateBps)}`, signal: pilotSignal(snapshot.repeat_seller_rate_bps, PILOT_TARGETS.repeatSellerRateBps) },
      ]
    : [];

  return (
    <main className="ops-shell">
      <header className="ops-top">
        <div><span className="brand">REWEAR<span>.</span></span><b>Admin</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/pilot">Pilot</Link>
          <Link href="/admin/items">Items</Link>
          <Link href="/admin/operations">Operations</Link>
          <Link href="/admin/settings">Selling Rules</Link>
        </nav>
      </header>

      <section className="ops-wrap pilot-wrap">
        <div className="ops-heading">
          <div>
            <p className="eyebrow dark">Admin → Pilot</p>
            <h1>Women’s pilot economics</h1>
            <p>Track live inventory, cumulative sales KPIs and the real cost of pickup, packing, labor and other operating work.</p>
          </div>
          <div className="security-chip">Pilot {PILOT_MODE.enabled ? "active" : "paused"} · max {PILOT_MODE.maxActiveItems} live items</div>
        </div>

        {message ? <div className={`ops-message ${type}`}>{message}</div> : null}
        {!databaseReady ? (
          <div className="ops-message error">
            Pilot database tracking is not active yet. The migration is committed with this release, but it must be applied to the connected production Supabase project before live KPI/cost data can load.
          </div>
        ) : null}

        {snapshot ? (
          <>
            <section className="pilot-period">
              <div><span>Pilot window</span><b>{localDate(snapshot.start_date)} → {localDate(snapshot.end_date)}</b></div>
              <div><span>Live inventory</span><b>{snapshot.active_listed_items} / {PILOT_MODE.maxActiveItems}</b></div>
              <div><span>Sold</span><b>{snapshot.sold_items}</b></div>
              <div><span>Gross sales</span><b>{formatCad(snapshot.gross_sales_cents)}</b></div>
            </section>

            <section className="pilot-kpi-grid">
              {metrics.map((metric) => (
                <article key={metric.label} className={signalClass(metric.signal)}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>Target {metric.target}</small>
                </article>
              ))}
            </section>

            <section className="ops-card pilot-money">
              <div className="ops-card-title"><div><h2>Real contribution</h2><p>Platform commission minus recorded cash costs and the value of owner/operator labor.</p></div><strong>{formatCad(snapshot.contribution_cents)}</strong></div>
              <div className="pilot-money-grid">
                <div><span>Platform commission</span><b>{formatCad(snapshot.platform_commission_cents)}</b></div>
                <div><span>Operating costs</span><b>− {formatCad(snapshot.operating_costs_cents)}</b></div>
                <div><span>Labor cost</span><b>− {formatCad(snapshot.labor_cost_cents)}</b></div>
                <div><span>Labor recorded</span><b>{snapshot.labor_minutes} min</b></div>
              </div>
            </section>
          </>
        ) : null}

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Record a pilot cost</h2><p>Enter direct cash costs and/or time spent. Labor cost is calculated from minutes × hourly value.</p></div></div>
          <form action={addPilotCost} className="pilot-cost-form">
            <label>Category
              <select name="category" required defaultValue="pickup">
                <option value="pickup">Pickup / collection</option>
                <option value="packaging">Packaging</option>
                <option value="payment">Payment fees</option>
                <option value="shipping_subsidy">Shipping subsidy</option>
                <option value="refund">Refund cost</option>
                <option value="storage">Storage</option>
                <option value="marketing">Marketing</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>Cash cost (CAD)<input name="amount" type="number" min="0" step="0.01" defaultValue="0" required /></label>
            <label>Time spent (minutes)<input name="labor_minutes" type="number" min="0" step="1" defaultValue="0" required /></label>
            <label>Hourly value (CAD)<input name="hourly_cost" type="number" min="0" step="0.01" defaultValue="0" required /></label>
            <label>Date/time<input name="occurred_at" type="datetime-local" /></label>
            <label className="pilot-note">Note<input name="note" type="text" maxLength={500} placeholder="Example: Saturday pickup route, 4 sellers" /></label>
            <button type="submit" disabled={!databaseReady || !access.can_manage_selling_rules}>Save cost</button>
          </form>
        </section>

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Recent cost entries</h2><p>Latest operational inputs used in the contribution calculation.</p></div><strong>{costRows.length}</strong></div>
          {costRows.length ? (
            <div className="pilot-cost-list">
              {costRows.map((entry) => (
                <article key={entry.id}>
                  <div><b>{entry.category.replaceAll("_", " ")}</b><span>{localDate(entry.occurred_at)}{entry.note ? ` · ${entry.note}` : ""}</span></div>
                  <div><b>{formatCad(entry.amount_cents)}</b><span>{entry.labor_minutes} min @ {formatCad(entry.hourly_cost_cents)}/h</span></div>
                </article>
              ))}
            </div>
          ) : <p className="empty">No pilot costs recorded yet.</p>}
        </section>

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Pilot decision guardrails</h2><p>Use the KPI trend plus contribution economics at the end of the 6–8 week test; do not expand categories just because the site can support them.</p></div></div>
          <p className="empty">Operational watch-outs: too much unsold inventory, weak average sale price, pickup/labor cost overtaking commission, scattered pickup routes, or inventory growing materially faster than sales.</p>
        </section>
      </section>
    </main>
  );
}
