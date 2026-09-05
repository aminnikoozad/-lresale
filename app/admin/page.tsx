import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminLiveAlerts } from "./admin-live-alerts";
import "./operations/operations.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, user, access } = await requireAdmin();
  const now = new Date().toISOString();
  const [items, requests, newRequests, slots, supportStatsResult] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }),
    supabase.from("collection_requests").select("id", { count: "exact", head: true }),
    supabase.from("collection_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("pickup_slots").select("id", { count: "exact", head: true }).eq("active", true).gt("window_start", now),
    supabase.rpc("support_admin_stats"),
  ]);
  const supportStats = Array.isArray(supportStatsResult.data) ? supportStatsResult.data[0] : supportStatsResult.data;

  return (
    <main className="ops-shell">
      <header className="ops-top">
        <div><span className="brand">REWEAR<span>.</span></span><b>Admin</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/support">Support{supportStats?.waiting ? ` (${supportStats.waiting})` : ""}</Link>
          <Link href="/admin/ai-trainer">AI Trainer</Link>
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
            <p>Customer support, AI training, pickup requests, inventory and privileged Rewear operations. This area is not linked from customer-facing pages.</p>
          </div>
          <div className="security-chip">MFA verified · {access.role}</div>
        </div>

        <section className="area-grid">
          <article className="active"><div><b>Support waiting</b><span>Human handoff queue</span></div><strong>{supportStats?.waiting ?? 0}</strong></article>
          <article className="active"><div><b>Urgent support</b><span>Open urgent conversations</span></div><strong>{supportStats?.urgent ?? 0}</strong></article>
          <article className="active"><div><b>AI training needed</b><span>Unanswered questions</span></div><strong>{supportStats?.unknown_open ?? 0}</strong></article>
          <article className="active"><div><b>New pickup requests</b><span>Waiting for review</span></div><strong>{newRequests.count ?? 0}</strong></article>
          <article className="active"><div><b>Items</b><span>Inventory records</span></div><strong>{items.count ?? 0}</strong></article>
          <article className="active"><div><b>Open pickup slots</b><span>Future active windows</span></div><strong>{slots.count ?? 0}</strong></article>
        </section>

        <AdminLiveAlerts />

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Customer Support OS</h2><p>AI handles approved repetitive questions; authenticated human support handles exceptions, disputes and sensitive cases.</p></div><strong>{supportStats?.total ?? 0} conversations</strong></div>
          <div className="area-grid">
            <article><div><b>Support Inbox</b><span>Waiting, assigned, AI-handled, urgent, resolved and closed conversations.</span></div><Link href="/admin/support">Open</Link></article>
            <article><div><b>AI Trainer</b><span>Chat, Teach, Review and Test Bot with approval-controlled learning.</span></div><Link href="/admin/ai-trainer">Open</Link></article>
            <article><div><b>Support Settings</b><span>Availability, notification preferences and configurable business hours.</span></div><Link href="/admin/support/settings">Open</Link></article>
            <article><div><b>Approved AI knowledge</b><span>Only approved policy knowledge is customer-facing.</span></div><Link href="/admin/ai-trainer">{supportStats?.kb_approved ?? 0} approved</Link></article>
          </div>
        </section>

        <section className="ops-card">
          <div className="ops-card-title">
            <div>
              <h2>Pickup workflow</h2>
              <p>A new request is tied to the customer’s permanent Customer ID, username and account. Open the request, then start intake under that same customer.</p>
            </div>
            <strong>{newRequests.count ?? 0} new</strong>
          </div>
          <div className="area-grid">
            <article><div><b>1. Pickup Inbox</b><span>See address, area, item count, fee, status, username and Customer ID.</span></div><Link href="/admin/operations#pickup-requests">Open</Link></article>
            <article><div><b>2. Customer item intake</b><span>Add photos, brand, category, size, condition and proposed price to the correct seller.</span></div><Link href="/admin/items">Open</Link></article>
            <article><div><b>3. Seller approval</b><span>The customer reviews the proposed initial price; commission locks when they approve.</span></div><Link href="/account">Customer view</Link></article>
            <article><div><b>4. Publish to Shop</b><span>After approval and at least one photo, publish the item to the live catalog.</span></div><Link href="/admin/items">Inventory</Link></article>
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

        <section className="ops-card"><div className="ops-card-title"><div><h2>Signed-in owner</h2><p>{user.email}</p></div><strong>{access.role}</strong></div><p className="empty">Total pickup requests: {requests.count ?? 0}</p></section>
      </section>
    </main>
  );
}
