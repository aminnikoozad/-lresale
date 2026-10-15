
import { Localize } from "@/components/site-language";
import Link from "next/link";
import type { ReactNode } from "react";
import { adminNavigation } from "@/lib/workspace-navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminLiveAlerts } from "./admin-live-alerts";
import "./operations/operations.css";

export const dynamic = "force-dynamic";

function AdminRouteLink({ href, children, permitted }: { href: string; children: ReactNode; permitted: ReadonlySet<string> }) {
    return href === "/account" || permitted.has(href)
      ? <Link href={href}>{children}</Link>
      : <span className="menu-restricted">Not available for your role</span>;
  }

export default async function AdminPage() {
  const { supabase, user, access } = await requireAdmin();
  const now = new Date().toISOString();
  const [items, requests, newRequests, slots, supportStatsResult, itemAccess, ruleAccess, supportContextResult] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }),
    supabase.from("collection_requests").select("id", { count: "exact", head: true }),
    supabase.from("collection_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("pickup_slots").select("id", { count: "exact", head: true }).eq("active", true).gt("window_start", now),
    supabase.rpc("support_admin_stats"),
    supabase.rpc("can_manage_items"),
    supabase.rpc("can_manage_selling_rules"),
    supabase.rpc("support_admin_context"),
  ]);
  const supportStats = Array.isArray(supportStatsResult.data) ? supportStatsResult.data[0] : supportStatsResult.data;

  const supportContext = supportContextResult.error ? null : Array.isArray(supportContextResult.data) ? supportContextResult.data[0] : supportContextResult.data;
  const permitted = new Set(adminNavigation({ ...access, can_manage_items: !itemAccess.error && itemAccess.data === true,
    can_manage_selling_rules: !ruleAccess.error && ruleAccess.data === true, can_support: supportContext?.can_support === true, ai_view: supportContext?.ai_view === true }).map((entry) => entry.href));


  return <Localize>{(
    <main className="ops-shell">
      <header className="ops-top">
        <div><span className="brand">Shikimomo<span>.</span></span><b>Admin</b></div>

      </header>

      <section className="ops-wrap">
        <div className="ops-heading">
          <div>
            <p className="eyebrow dark">Private administration</p>
            <h1>Admin Dashboard</h1>
            {access.can_manage_selling_rules && <Link href="/admin/smart-shop">Smart Shopping controls</Link>}
            <p>Customer support, pickup requests, inventory and privileged Shikimomo operations. This area is not linked from customer-facing pages.</p>
          </div>
          <div className="security-chip">{access.has_aal2 ? "MFA verified" : "Signed in"} · {access.role}</div>
        </div>

        <section className="area-grid">
          {supportContext?.can_support ? <article className="active"><div><b>Support waiting</b><span>Human handoff queue</span></div><strong>{supportStats?.waiting ?? 0}</strong></article> : null}
          {supportContext?.can_support ? <article className="active"><div><b>Urgent support</b><span>Open urgent conversations</span></div><strong>{supportStats?.urgent ?? 0}</strong></article> : null}
          {access.can_manage_pickups ? <article className="active"><div><b>New pickup requests</b><span>Waiting for review</span></div><strong>{newRequests.count ?? 0}</strong></article> : null}
          {itemAccess.data === true ? <article className="active"><div><b>Items</b><span>Inventory records</span></div><strong>{items.count ?? 0}</strong></article> : null}
          {access.can_manage_pickups || access.can_manage_shipping ? <article className="active"><div><b>Open pickup slots</b><span>Future active windows</span></div><strong>{slots.count ?? 0}</strong></article> : null}
        </section>

        {access.can_manage_pickups ? <AdminLiveAlerts /> : null}

        {supportContext?.can_support ? (<section className="ops-card">
          <div className="ops-card-title"><div><h2>Customer Support OS</h2><p>Authenticated human support handles exceptions, disputes and sensitive cases. The shopping assistant is available from the storefront.</p></div><strong>{supportStats?.total ?? 0} conversations</strong></div>
          <div className="area-grid">
            <article><div><b>Support Inbox</b><span>Waiting, assigned, urgent, resolved and closed conversations.</span></div><AdminRouteLink permitted={permitted} href="/admin/support">Open</AdminRouteLink></article>
            <article><div><b>Support Settings</b><span>Availability, notification preferences and configurable business hours.</span></div><AdminRouteLink permitted={permitted} href="/admin/support/settings">Open</AdminRouteLink></article>
          </div>
        </section>) : null}

        {access.can_manage_pickups || itemAccess.data === true ? (<section className="ops-card">
          <div className="ops-card-title">
            <div>
              <h2>Pickup workflow</h2>
              <p>A new request is tied to the customer’s permanent Customer ID, username and account. Open the request, then start intake under that same customer.</p>
            </div>
            <strong>{newRequests.count ?? 0} new</strong>
          </div>
          <div className="area-grid">
            <article><div><b>1. Pickup Inbox</b><span>See address, area, item count, fee, status, username and Customer ID.</span></div><AdminRouteLink permitted={permitted} href="/admin/operations#pickup-requests">Open</AdminRouteLink></article>
            <article><div><b>2. Customer item intake</b><span>Add photos, brand, category, size, condition and proposed price to the correct seller.</span></div><AdminRouteLink permitted={permitted} href="/admin/items">Open</AdminRouteLink></article>
            <article><div><b>3. Seller approval</b><span>The customer reviews the proposed initial price; commission locks when they approve.</span></div><AdminRouteLink permitted={permitted} href="/account">Customer view</AdminRouteLink></article>
            <article><div><b>4. Publish to Shop</b><span>After recorded physical inspection, seller approval and photos, publish eligible items to the catalog.</span></div><AdminRouteLink permitted={permitted} href="/admin/items">Inventory</AdminRouteLink></article>
          </div>
        </section>) : null}

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Operations</h2><p>Manage scheduling, pilot scope, item processing, business rules and secure owner controls.</p></div></div>
          <div className="area-grid">
            <article><div><b>Pilot Control & Economics</b><span>Change pilot categories, live-item cap, pickup days, duration and record real operating costs without editing code.</span></div><AdminRouteLink permitted={permitted} href="/admin/pilot">Open</AdminRouteLink></article>
            <article><div><b>Pickup Scheduler</b><span>Create and pause customer-selectable time windows.</span></div><AdminRouteLink permitted={permitted} href="/admin/operations">Open</AdminRouteLink></article>
            <article><div><b>Item & Bundle Management</b><span>Inspect, price, photograph, bundle and publish seller items.</span></div><AdminRouteLink permitted={permitted} href="/admin/items">Open</AdminRouteLink></article>
            <article><div><b>Selling Rules</b><span>Minimums, commissions and configurable business rules.</span></div><AdminRouteLink permitted={permitted} href="/admin/settings">Open</AdminRouteLink></article>
            <article><div><b>Security</b><span>Password, MFA status and privileged account controls.</span></div><AdminRouteLink permitted={permitted} href="/admin/security">Open</AdminRouteLink></article>
          </div>
        </section>

        <section className="ops-card"><div className="ops-card-title"><div><h2>Signed-in staff</h2><p>{user.email}</p></div><strong>{access.role}</strong></div>{access.can_manage_pickups ? <p className="empty">Total pickup requests: {requests.count ?? 0}</p> : null}</section>
      </section>
    </main>
  )}</Localize>;
}
