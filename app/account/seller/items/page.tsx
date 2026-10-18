
import { Localize } from "@/components/site-language";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setUnsoldPreference } from "@/app/account/operations-actions";
import { acceptTeamPricing } from "@/app/account/pricing-actions";
import "../../operations/operations.css";

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
  if (!user) redirect("/login?next=/account/seller/items");

  const [{ data, error }, params, mandate] = await Promise.all([
    supabase.rpc("seller_operations_snapshot"),
    searchParams,
    supabase.rpc("my_team_pricing_mandate"),
  ]);
  if (error || !data) throw new Error("Item operations could not be loaded.");
  const items = ((data as Snapshot).items ?? []);
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "error" ? "error" : "success";

  return <Localize>{(
    <main className="seller-ops-shell">

      <section className="seller-ops-wrap">
        <div className="seller-ops-heading">
          <p className="eyebrow dark">My items → Operations</p>
          <h1>Follow every item</h1><Link href="/sell-with-shikimomo">Seller guide</Link>
          <p>Follow inspection, Shikimomo pricing and publishing, and choose what happens if an item does not sell.</p>
        </div>
        {message ? <div className={`seller-ops-message ${type}`}>{message}</div> : null}

        {!mandate.error && mandate.data ? <section className="seller-review-box">
          <div><h2>Pricing by Shikimomo</h2>
            <p>After inspection, Shikimomo sets the price and locks your commission tier. With your one-time authorization, each item can be published without a separate price approval. You can follow prices and earnings in your account.</p>
            <p>Previously locked prices and commission tiers stay unchanged. This authorization covers your current unapproved items and future items, including bundles.</p>
            <Link href="/seller-terms">Read the seller terms</Link>
          </div>
          {mandate.data.accepted ? <p>Team pricing authorized.</p> : <form action={acceptTeamPricing}>
            <label><input type="checkbox" name="pricing_mandate" value="accepted" required /> I authorize Shikimomo to set and manage selling prices after inspection under the seller terms.</label>
            <button type="submit">Authorize team pricing</button>
          </form>}
        </section> : null}

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

              {needsReview ? <p>{mandate.data?.accepted
                ? "Shikimomo will finalize this price after inspection. No separate price approval is needed."
                : "Authorize team pricing above so Shikimomo can finalize prices and publish your items."}</p> : null}

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
        })}</div> : <div className="seller-ops-empty"><h2>No items yet</h2><p>Your item timeline appears here after Shikimomo receives your first item.</p></div>}
      </section>
    </main>
  )}</Localize>;
}
