import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { scheduleAutoPublish, setUnsoldPreference } from "../operations-actions";
import "./operations.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type TimelineEvent = {
  type: string;
  label: string;
  at: string;
};

type SellerItem = {
  itemId: string;
  itemCode: string;
  name: string;
  status: string;
  stage: string;
  reviewReadyAt: string | null;
  reviewDeadlineAt: string | null;
  autoPublishAt: string | null;
  publishedAt: string | null;
  lastChanceAt: string | null;
  sellingExpiresAt: string | null;
  listedPriceCents: number | null;
  initialPriceCents: number | null;
  dispositionPreference: string | null;
  rejectionReason: string | null;
  rejectionPhotoUrl: string | null;
  timeline: TimelineEvent[];
};

type Snapshot = { items?: SellerItem[] };

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cad(cents: number | null) {
  if (cents == null) return "Pending";
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

export default async function SellerOperationsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data, error }, params] = await Promise.all([
    supabase.rpc("seller_operations_snapshot"),
    searchParams,
  ]);
  if (error || !data) throw new Error("Item operations could not be loaded.");
  const items = ((data as Snapshot).items ?? []);
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "error" ? "error" : "success";

  return (
    <main className="seller-ops-shell">
      <header className="seller-ops-top">
        <Link href="/" className="brand">REWEAR<span>.</span></Link>
        <nav><Link href="/account">Selling dashboard</Link><Link href="/sell-with-rewear">Seller guide</Link><Link href="/account/purchases">Purchases</Link></nav>
      </header>
      <section className="seller-ops-wrap">
        <div className="seller-ops-heading">
          <p className="eyebrow dark">My items → Operations</p>
          <h1>Follow every item</h1>
          <p>See where each item is in the REWEAR process, review pricing, schedule publishing, and decide what should happen if it does not sell.</p>
        </div>
        {message ? <div className={`seller-ops-message ${type}`}>{message}</div> : null}

        {items.length ? <div className="seller-ops-list">{items.map((item) => {
          const needsReview = item.stage === "seller_review" && item.initialPriceCents != null && !item.autoPublishAt;
          return (
            <article className="seller-ops-item" key={item.itemId}>
              <header>
                <div><span className="item-code">{item.itemCode}</span><h2>{item.name}</h2></div>
                <span className={`ops-stage stage-${item.stage}`}>{label(item.stage)}</span>
              </header>
              <div className="seller-ops-facts">
                <div><span>Initial price</span><b>{cad(item.initialPriceCents)}</b></div>
                <div><span>Current price</span><b>{cad(item.listedPriceCents ?? item.initialPriceCents)}</b></div>
                <div><span>Review deadline</span><b>{when(item.reviewDeadlineAt)}</b></div>
                <div><span>Auto publish</span><b>{when(item.autoPublishAt)}</b></div>
                <div><span>Last Chance</span><b>{when(item.lastChanceAt)}</b></div>
                <div><span>Selling period ends</span><b>{when(item.sellingExpiresAt)}</b></div>
              </div>

              {item.status === "rejected" && item.rejectionReason ? (
                <section className="rejection-box">
                  <div>
                    <h3>Why this item was not accepted</h3>
                    <p>{item.rejectionReason}</p>
                  </div>
                  {item.rejectionPhotoUrl ? (
                    <a href={item.rejectionPhotoUrl} target="_blank" rel="noreferrer" className="rejection-photo-link">
                      <img src={item.rejectionPhotoUrl} alt={`Inspection evidence for ${item.name}`} />
                      <span>View inspection photo</span>
                    </a>
                  ) : null}
                </section>
              ) : null}

              {needsReview ? (
                <section className="seller-review-box">
                  <div><h3>Ready for your review</h3><p>Approve the displayed initial price and locked commission, then REWEAR will publish this item automatically after the review window.</p></div>
                  <form action={scheduleAutoPublish}>
                    <input type="hidden" name="item_id" value={item.itemId} />
                    <input type="hidden" name="expected_price" value={item.initialPriceCents ?? ""} />
                    <button type="submit">Approve & schedule publishing</button>
                  </form>
                </section>
              ) : null}

              {!['sold','closed'].includes(item.stage) ? (
                <section className="unsold-choice">
                  <div><h3>If this item does not sell</h3><p>Choose the default end-of-selling-period action. You can change this before the item sells.</p></div>
                  <div className="choice-actions">
                    <form action={setUnsoldPreference}>
                      <input type="hidden" name="item_id" value={item.itemId} />
                      <input type="hidden" name="preference" value="return" />
                      <button type="submit" className={item.dispositionPreference === "return" ? "selected" : ""}>Return to me</button>
                    </form>
                    <form action={setUnsoldPreference}>
                      <input type="hidden" name="item_id" value={item.itemId} />
                      <input type="hidden" name="preference" value="donate" />
                      <button type="submit" className={item.dispositionPreference === "donate" ? "selected" : ""}>Donate / Reuse</button>
                    </form>
                  </div>
                </section>
              ) : null}

              <section className="timeline">
                <h3>Timeline</h3>
                {item.timeline.length ? <ol>{item.timeline.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <span />
                    <div><b>{label(event.label)}</b><small>{when(event.at)}</small></div>
                  </li>
                ))}</ol> : <p>No processing events yet.</p>}
              </section>
            </article>
          );
        })}</div> : <div className="seller-ops-empty"><h2>No items yet</h2><p>Your item timeline appears here after REWEAR receives your first item.</p></div>}
      </section>
    </main>
  );
}
