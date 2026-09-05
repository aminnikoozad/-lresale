import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import "./operations/operations.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, user, access } = await requireAdmin();
  const [items, requests, slots] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }),
    supabase.from("collection_requests").select("id", { count: "exact", head: true }),
    supabase.from("pickup_slots").select("id", { count: "exact", head: true }).eq("active", true).gt("window_start", new Date().toISOString()),
  ]);

  return (
    <main className="ops-shell">
      <header className="ops-top">
        <div><span className="brand">REWEAR<span>.</span></span><b>Admin</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
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
            <p>Operational access for authorized Rewear staff. This area is not linked from customer-facing pages.</p>
          </div>
          <div className="security-chip">MFA verified · {access.role}</div>
        </div>

        <section className="area-grid">
          <article className="active"><div><b>Items</b><span>Inventory records</span></div><strong>{items.count ?? 0}</strong></article>
          <article className="active"><div><b>Pickup requests</b><span>All customer requests</span></div><strong>{requests.count ?? 0}</strong></article>
          <article className="active"><div><b>Open pickup slots</b><span>Future active windows</span></div><strong>{slots.count ?? 0}</strong></article>
          <article className="active"><div><b>Admin account</b><span>{user.email}</span></div><strong>{access.role}</strong></article>
        </section>

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Operations</h2><p>Manage pickup areas, pickup times, reminder timing and Canada-wide delivery settings.</p></div></div>
          <div className="area-grid">
            <article><div><b>Pickup Scheduler</b><span>Create and pause customer-selectable time windows.</span></div><Link href="/admin/operations">Open</Link></article>
            <article><div><b>Item & Bundle Management</b><span>Inspect, price, bundle and manage seller items.</span></div><Link href="/admin/items">Open</Link></article>
            <article><div><b>Selling Rules</b><span>Minimums, commissions and configurable business rules.</span></div><Link href="/admin/settings">Open</Link></article>
            <article><div><b>Security</b><span>Password, MFA status and privileged account controls.</span></div><Link href="/admin/security">Open</Link></article>
          </div>
        </section>
      </section>
    </main>
  );
}
