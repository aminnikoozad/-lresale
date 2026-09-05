import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminLiveAlerts } from "./admin-live-alerts";
import "./operations/operations.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, user, access } = await requireAdmin();
  const now = new Date().toISOString();
  const [items, requests, newRequests, slots] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }),
    supabase.from("collection_requests").select("id", { count: "exact", head: true }),
    supabase.from("collection_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("pickup_slots").select("id", { count: "exact", head: true }).eq("active", true).gt("window_start", now),
  ]);

  return (
    <main className="ops-shell">
      <header className="ops-top">
        <div><span className="brand">REWEAR<span>.</span></span><b>Admin</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/operations#pickup-requests">Pickup Inbox{newRequests.count ? ` (${newRequests.count})` : ""}</Link>
          <Link href="/admin/items">Items</Link>
          <Link href="/admin/operations">Operations</Link>
          <Link href="/admin/settings">Selling Rules</Link>
          <Link href="/admin/security">Security</Link>
        </nav>
      </header>

      <section className="ops-wrap">
        <div className="ops-heading">
          <div>
            <p className="eyebrow dark">Private administration</p>
            <h1>Admin Dashboard</h1>
            <p>Pickup requests, customer intake, inventory and privileged Rewear operations. This area is not linked from customer-facing pages.</p>
          </div>
          <div className="security-chip">MFA verified · {access.role}</div>
        </div>

        <section className="area-grid">
          <article className="active"><div><b>New pickup requests</b><span>Waiting for review</span></div><strong>{newRequests.count ?? 0}</strong></article>
          <article className="active"><div><b>Total pickup requests</b><span>All customer requests</span></div><strong>{requests.count ?? 0}</strong></article>
          <article className="active"><div><b>Items</b><span>Inventory records</span></div><strong>{items.count ?? 0}</strong></article>
          <article className="active"><div><b>Open pickup slots</b><span>Future active windows</span></div><strong>{slots.count ?? 0}</strong></article>
        </section>

        <AdminLiveAlerts />

        <section className="ops-card">
          <div className="ops-card-title">
            <div>
              <h2>Pickup workflow</h2>
              <p>A new request is tied to the customer’s permanent Customer ID, username and account. Open the request, then start intake under that same customer.</p>
            </div>
            <strong>{newRequests.count ?? 0} new</strong>
          </div>
          <div className="area-grid">
            <article>
              <div><b>1. Pickup Inbox</b><span>See address, area, item count, fee, status, username and Customer ID.</span></div>
              <Link href="/admin/operations#pickup-requests">Open</Link>
            </article>
            <article>
              <div><b>2. Customer item intake</b><span>Add photos, brand, category, size, condition and proposed price to the correct seller.</span></div>
              <Link href="/admin/items">Open</Link>
            </article>
            <article>
              <div><b>3. Seller approval</b><span>The customer reviews the proposed initial price; commission locks when they approve.</span></div>
              <Link href="/account">Customer view</Link>
            </article>
            <article>
              <div><b>4. Publish to Shop</b><span>After approval and at least one photo, publish the item to the live catalog.</span></div>
              <Link href="/admin/items">Inventory</Link>
            </article>
          </div>
        </section>

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Operations</h2><p>Manage scheduling, item processing, business rules and secure owner controls.</p></div></div>
          <div className="area-grid">
            <article><div><b>Pickup Scheduler</b><span>Create and pause customer-selectable time windows.</span></div><Link href="/admin/operations">Open</Link></article>
            <article><div><b>Item & Bundle Management</b><span>Inspect, price, photograph, bundle and publish seller items.</span></div><Link href="/admin/items">Open</Link></article>
            <article><div><b>Selling Rules</b><span>Minimums, commissions and configurable business rules.</span></div><Link href="/admin/settings">Open</Link></article>
            <article><div><b>Security</b><span>Password, MFA status and privileged account controls.</span></div><Link href="/admin/security">Open</Link></article>
          </div>
        </section>

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Signed-in owner</h2><p>{user.email}</p></div><strong>{access.role}</strong></div>
        </section>
      </section>
    </main>
  );
}
