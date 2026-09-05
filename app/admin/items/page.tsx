import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatCadFromCents, loadSellingRules } from "@/lib/business-rules";
import { createAdminBundle, createAdminItem, reviewAdminItem } from "./actions";
import "./items.css";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Customer = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  customer_code: string | null;
  email: string | null;
};

type AdminItem = {
  item_id: string;
  owner_id: string;
  owner_name: string | null;
  owner_username: string | null;
  customer_code: string | null;
  name: string;
  brand: string | null;
  category: string;
  status: string;
  initial_price_cents: number | null;
  seller_bps: number | null;
  platform_bps: number | null;
  seller_approved_at: string | null;
  created_at: string;
};

function dollars(cents: number | null) {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function AdminItemsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [permissionResult, customerResult, itemResult, rules, params] = await Promise.all([
    supabase.rpc("can_manage_items"),
    supabase.rpc("admin_customer_options"),
    supabase.rpc("admin_item_list"),
    loadSellingRules(supabase),
    searchParams,
  ]);

  if (permissionResult.error || !permissionResult.data) {
    redirect("/account");
  }

  const customers = (customerResult.data ?? []) as Customer[];
  const items = (itemResult.data ?? []) as AdminItem[];
  const candidates = items.filter(
    (item) => ["bundle_candidate", "manual_review"].includes(item.status) && !item.seller_approved_at,
  );
  const message = typeof params.message === "string" ? params.message : null;
  const messageType = params.type === "error" ? "error" : "success";

  return (
    <main className="admin-items-shell">
      <header className="admin-items-top">
        <div>
          <Link href="/" className="brand">REWEAR<span>.</span></Link>
          <span className="admin-pill">Admin</span>
        </div>
        <nav>
          <Link href="/admin/items">Items</Link>
          <Link href="/admin/settings">Selling Rules</Link>
          <Link href="/account">Customer account</Link>
        </nav>
      </header>

      <section className="admin-items-wrap">
        <div className="admin-items-heading">
          <div>
            <p className="eyebrow dark">Admin → Items</p>
            <h1>Item & Bundle Management</h1>
            <p>
              Add items for customers, apply the {formatCadFromCents(rules.minimumIndividualItemValueCents)} minimum,
              route lower-value items to bundles/review, and preserve commission approval history.
            </p>
          </div>
          <div className="rule-snapshot">
            <span>Individual minimum</span>
            <strong>{formatCadFromCents(rules.minimumIndividualItemValueCents)}</strong>
            <span>Pickup minimum</span>
            <strong>{formatCadFromCents(rules.minimumPickupEstimatedValueCents)}</strong>
          </div>
        </div>

        {message ? <div className={`admin-items-message ${messageType}`}>{message}</div> : null}

        <section className="admin-items-card">
          <div className="card-heading">
            <div>
              <h2>Add item for customer</h2>
              <p>
                If the proposed price is below {formatCadFromCents(rules.minimumIndividualItemValueCents)}, choose what staff should do with it.
              </p>
            </div>
          </div>
          <form className="admin-item-form" action={createAdminItem}>
            <label>Customer
              <select name="owner_id" required defaultValue="">
                <option value="" disabled>Select customer</option>
                {customers.map((customer) => (
                  <option value={customer.user_id} key={customer.user_id}>
                    {customer.full_name || customer.email || "Customer"} · @{customer.username || "user"} · {customer.customer_code || customer.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label>Item name
              <input name="name" minLength={2} maxLength={160} required placeholder="Example: Aritzia wool coat" />
            </label>
            <label>Brand
              <input name="brand" maxLength={100} placeholder="Aritzia" />
            </label>
            <label>Category
              <select name="category" required defaultValue="women">
                <option value="women">Women</option>
                <option value="men">Men</option>
                <option value="kids">Kids</option>
                <option value="shoes">Shoes</option>
                <option value="accessories">Accessories</option>
                <option value="electronics">Electronics</option>
              </select>
            </label>
            <label>Initial proposed price (CAD)
              <input name="initial_price" type="number" min="0.01" step="0.01" required placeholder="20.00" />
            </label>
            <label>Decision if below minimum
              <select name="below_minimum_action" defaultValue="normal">
                <option value="normal">Normal individual listing (only if at/above minimum)</option>
                <option value="bundle_candidate">Add to Bundle candidates</option>
                <option value="reject">Reject Item</option>
                <option value="manual_review">Manual Review</option>
                <option value="override">Continue with Owner/Admin Override</option>
              </select>
            </label>
            <label className="full">Reason / internal note
              <textarea name="reason" maxLength={500} rows={3} placeholder="Required for reject, manual review or below-minimum override." />
            </label>
            <button className="primary-action" type="submit">Add item to customer</button>
          </form>
          <p className="form-note">
            Below-minimum overrides require Owner/Admin permission and are written to the Audit Log with administrator identity and timestamp.
          </p>
        </section>

        <section className="admin-items-card">
          <div className="card-heading">
            <div>
              <h2>Create bundle</h2>
              <p>
                Select at least two eligible lower-value items belonging to the same seller. The bundle becomes its own sellable record and keeps links to every original item.
              </p>
            </div>
          </div>
          <form className="bundle-form" action={createAdminBundle}>
            <div className="bundle-fields">
              <label>Seller
                <select name="owner_id" required defaultValue="">
                  <option value="" disabled>Select seller</option>
                  {customers.map((customer) => (
                    <option value={customer.user_id} key={customer.user_id}>
                      {customer.full_name || customer.email || "Customer"} · {customer.customer_code || "No code"}
                    </option>
                  ))}
                </select>
              </label>
              <label>Bundle title
                <input name="title" minLength={2} maxLength={160} required placeholder="3 casual shirts bundle" />
              </label>
              <label>Initial bundle price (CAD)
                <input name="initial_price" type="number" min={rules.minimumIndividualItemValueCents / 100} step="0.01" required placeholder={(rules.minimumIndividualItemValueCents / 100).toFixed(2)} />
              </label>
              <label>Internal reason / note
                <input name="reason" maxLength={500} placeholder="Why these items were bundled" />
              </label>
            </div>
            <div className="candidate-list">
              {candidates.length ? candidates.map((item) => (
                <label className="candidate" key={item.item_id}>
                  <input type="checkbox" name="item_ids" value={item.item_id} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.owner_name || item.owner_username || "Customer"} · {item.customer_code || "No code"} · {item.initial_price_cents != null ? formatCadFromCents(item.initial_price_cents) : "No price"} · {statusLabel(item.status)}
                    </small>
                  </span>
                </label>
              )) : <p className="empty-note">No eligible bundle candidates yet.</p>}
            </div>
            <button className="primary-action" type="submit" disabled={candidates.length < 2}>Create bundle & request seller approval</button>
          </form>
        </section>

        <section className="admin-items-card">
          <div className="card-heading">
            <div>
              <h2>Items</h2>
              <p>Review current price, status, owner identity and seller approval state.</p>
            </div>
            <strong>{items.length} records</strong>
          </div>
          <div className="admin-item-list">
            {items.length ? items.map((item) => (
              <article className="admin-item-row" key={item.item_id}>
                <div className="item-summary">
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.brand || "No brand"} · {statusLabel(item.category)}</p>
                  </div>
                  <span className={`status-badge status-${item.status}`}>{statusLabel(item.status)}</span>
                </div>
                <dl>
                  <div><dt>Customer</dt><dd>{item.owner_name || "Customer"}</dd></div>
                  <div><dt>Username</dt><dd>@{item.owner_username || "—"}</dd></div>
                  <div><dt>Customer ID</dt><dd>{item.customer_code || "—"}</dd></div>
                  <div><dt>Initial price</dt><dd>{item.initial_price_cents == null ? "Pending" : formatCadFromCents(item.initial_price_cents)}</dd></div>
                  <div><dt>Seller share</dt><dd>{item.seller_bps == null ? "Not locked" : `${item.seller_bps / 100}%`}</dd></div>
                  <div><dt>Seller approval</dt><dd>{item.seller_approved_at ? "Approved / locked" : "Pending"}</dd></div>
                </dl>
                {!item.seller_approved_at ? (
                  <form className="review-form" action={reviewAdminItem}>
                    <input type="hidden" name="item_id" value={item.item_id} />
                    <label>Proposed price
                      <input name="initial_price" type="number" min="0.01" step="0.01" defaultValue={dollars(item.initial_price_cents)} required />
                    </label>
                    <label>Review action
                      <select name="review_action" defaultValue={item.initial_price_cents != null && item.initial_price_cents >= rules.minimumIndividualItemValueCents ? "accept" : "bundle_candidate"}>
                        <option value="accept">Accept individual item</option>
                        <option value="bundle_candidate">Add to Bundle</option>
                        <option value="reject">Reject Item</option>
                        <option value="manual_review">Manual Review</option>
                        <option value="override">Owner/Admin Override</option>
                      </select>
                    </label>
                    <label>Reason
                      <input name="reason" maxLength={500} placeholder="Required for reject/review/override" />
                    </label>
                    <button type="submit">Save review</button>
                  </form>
                ) : <p className="locked-note">Commission and initial approved price are permanently locked for this item.</p>}
              </article>
            )) : <p className="empty-note">No items have been added yet.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
