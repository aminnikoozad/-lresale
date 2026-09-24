import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { ItemBarcode } from "@/components/item-barcode";
import { assignWarehouseLocation, createWarehouseLocation, runOperationsAutomation } from "./actions";
import "./processing.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type QueueItem = {
  itemId: string;
  itemCode: string;
  name: string;
  brand: string | null;
  status: string;
  stage: string;
  ownerName: string | null;
  customerCode: string | null;
  photoCount: number;
  inspectedAt: string | null;
  reviewDeadlineAt: string | null;
  publishedAt: string | null;
  lastChanceAt: string | null;
  sellingExpiresAt: string | null;
  listedPriceCents: number | null;
  warehouseLocationId: string | null;
  warehouseLocationCode: string | null;
};

type Location = { id: string; code: string; label: string | null; active: boolean };
type Snapshot = { counts?: Record<string, number>; items?: QueueItem[]; locations?: Location[] };

const STAGES = [
  "inspection",
  "photography",
  "seller_review",
  "ready_to_publish",
  "live",
  "last_chance",
  "reserved",
  "sold",
  "expired",
  "returning",
  "donation",
  "closed",
] as const;

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cad(cents: number | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function when(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ProcessingPage({ searchParams }: Props) {
  const { supabase, access } = await requireAdmin();
  const [{ data, error }, params] = await Promise.all([
    supabase.rpc("admin_processing_snapshot"),
    searchParams,
  ]);
  if (error || !data) throw new Error("Processing queue could not be loaded.");

  const snapshot = data as Snapshot;
  const items = snapshot.items ?? [];
  const locations = (snapshot.locations ?? []).filter((location) => location.active);
  const counts = snapshot.counts ?? {};
  const message = typeof params.message === "string" ? params.message : null;
  const messageType = params.type === "error" ? "error" : "success";
  const query = typeof params.q === "string" ? params.q.trim().toUpperCase() : "";
  const filtered = query
    ? items.filter((item) => item.itemCode.includes(query) || item.name.toUpperCase().includes(query) || (item.customerCode ?? "").toUpperCase().includes(query))
    : items;

  return (
    <main className="processing-shell">
      <header className="processing-top">
        <div><Link href="/" className="brand">REWEAR<span>.</span></Link><b>Operations</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/operations">Pickup</Link>
          <Link href="/admin/items">Items</Link>
          <Link href="/admin/processing">Processing</Link>
          <Link href="/admin/pilot">Pilot</Link>
        </nav>
      </header>

      <section className="processing-wrap">
        <div className="processing-heading">
          <div>
            <p className="eyebrow dark">Admin → Processing</p>
            <h1>Warehouse processing queue</h1>
            <p>One operational view from inspection through seller review, live inventory, Last Chance and end-of-selling-period handling.</p>
          </div>
          <div className="ops-security">MFA verified · {access.role}</div>
        </div>

        {message ? <div className={`processing-message ${messageType}`}>{message}</div> : null}

        <section className="stage-grid" aria-label="Processing stage counts">
          {STAGES.map((stage) => (
            <a href={`#stage-${stage}`} key={stage}>
              <span>{label(stage)}</span>
              <strong>{counts[stage] ?? 0}</strong>
            </a>
          ))}
        </section>

        <section className="processing-card controls-grid">
          <div>
            <h2>Find / scan an item</h2>
            <p>Scan a Code 39 label into this field or type the REWEAR item code.</p>
            <form method="get" className="inline-form">
              <input name="q" defaultValue={query} placeholder="RW-00001000" autoComplete="off" autoFocus={Boolean(query)} />
              <button type="submit">Find item</button>
            </form>
          </div>
          <div>
            <h2>Create warehouse location</h2>
            <p>Use stable physical codes such as A-03-B12. Locations remain reusable when items move.</p>
            <form action={createWarehouseLocation} className="inline-form location-create">
              <input name="code" required maxLength={32} placeholder="A-03-B12" />
              <input name="label" maxLength={120} placeholder="Rack A · Shelf 3 · Bin 12" />
              <button type="submit">Create</button>
            </form>
          </div>
          <div>
            <h2>Automation health</h2>
            <p>Supabase Cron runs publishing, configured markdowns, Last Chance and selling-period expiry every hour.</p>
            <form action={runOperationsAutomation}>
              <button type="submit">Run safe automation now</button>
            </form>
          </div>
        </section>

        <section className="processing-card">
          <div className="card-title"><div><h2>Inventory work queue</h2><p>{query ? `${filtered.length} matching records` : `${items.length} records`}</p></div></div>
          {filtered.length ? (
            <div className="queue-list">
              {filtered.map((item) => (
                <article className="queue-item" id={`stage-${item.stage}`} key={item.itemId}>
                  <div className="queue-main">
                    <div className="barcode-wrap"><ItemBarcode value={item.itemCode} /></div>
                    <div>
                      <div className="queue-title"><h3>{item.name}</h3><span className={`stage stage-${item.stage}`}>{label(item.stage)}</span></div>
                      <p>{item.brand || "Unbranded"} · {item.ownerName || "Customer"} · {item.customerCode || "No customer code"}</p>
                      <dl>
                        <div><dt>Database status</dt><dd>{label(item.status)}</dd></div>
                        <div><dt>Inspection</dt><dd>{item.inspectedAt ? "Complete" : "Waiting"}</dd></div>
                        <div><dt>Photos</dt><dd>{item.photoCount}</dd></div>
                        <div><dt>Price</dt><dd>{cad(item.listedPriceCents)}</dd></div>
                        <div><dt>Seller review deadline</dt><dd>{when(item.reviewDeadlineAt)}</dd></div>
                        <div><dt>Last Chance</dt><dd>{when(item.lastChanceAt)}</dd></div>
                        <div><dt>Selling period ends</dt><dd>{when(item.sellingExpiresAt)}</dd></div>
                        <div><dt>Warehouse location</dt><dd>{item.warehouseLocationCode || "Unassigned"}</dd></div>
                      </dl>
                    </div>
                  </div>
                  <form action={assignWarehouseLocation} className="location-form">
                    <input type="hidden" name="item_id" value={item.itemId} />
                    <select name="location_id" required defaultValue={item.warehouseLocationId ?? ""}>
                      <option value="" disabled>Assign location</option>
                      {locations.map((location) => <option value={location.id} key={location.id}>{location.code}{location.label ? ` · ${location.label}` : ""}</option>)}
                    </select>
                    <button type="submit" disabled={!locations.length}>Save location</button>
                    <Link href={`/admin/items?item=${encodeURIComponent(item.itemId)}`}>Open item →</Link>
                  </form>
                </article>
              ))}
            </div>
          ) : <p className="empty">No items match this queue.</p>}
        </section>
      </section>
    </main>
  );
}
