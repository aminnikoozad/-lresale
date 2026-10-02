import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { progressOrder, reviewReturn } from "./actions";
import "../operations/operations.css";

export const dynamic = "force-dynamic";

type ReturnClaim = { id: string; itemId: string; reason: string; status: string };
type Order = {
  id: string; buyer_email: string; status: string; payment_status: string;
  subtotal_cents: number; shipping_cents: number | null; tax_cents: number | null; total_cents: number | null;
  recipient_name: string; address_line1: string; address_line2: string | null;
  city: string; province: string; postal_code: string; tracking_number: string | null;
  reservation_expires_at: string | null; created_at: string;
  items: Array<{ id: string; name: string; priceCents: number }>;
  returns: ReturnClaim[];
};

function money(cents: number | null) {
  return cents === null ? "Pending" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { supabase, access } = await requireAdmin();
  if (!access.can_manage_shipping) redirect("/admin");
  if (!access.has_aal2) redirect("/admin/mfa");
  const [{ data, error }, params] = await Promise.all([
    supabase.rpc("admin_order_queue", { p_limit: 50 }), searchParams,
  ]);
  if (error) throw new Error("The private order queue could not be loaded.");
  const orders = (data ?? []) as Order[];
  const canReviewReturns = ["owner", "admin"].includes(access.role);
  return <main className="ops-shell">
    <header className="ops-top"><div><Link href="/admin" className="brand">REWEAR<span>.</span></Link><b>Admin</b></div><nav><Link href="/admin">Dashboard</Link><Link href="/admin/items">Items</Link><Link href="/admin/readiness">Readiness</Link></nav></header>
    <section className="ops-wrap">
      <div className="ops-heading"><div><p className="eyebrow dark">Private fulfilment</p><h1>Orders & returns</h1><p>Only verified paid orders can move through processing, shipping and delivery. Reviewing a return does not issue a refund.</p></div><div className="security-chip">MFA verified · {access.role}</div></div>
      {params.message ? <div className="ops-message">{params.message}</div> : null}
      {orders.length ? orders.map(order => {
        const next = order.status === "paid" ? "processing" : order.status === "processing" ? "shipped" : order.status === "shipped" ? "delivered" : null;
        return <article className="ops-card" key={order.id}>
          <div className="ops-card-title"><div><h2>Order {order.id.slice(0,8).toUpperCase()}</h2><p>{order.buyer_email} · {new Date(order.created_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}</p></div><strong>{order.status} · {order.payment_status}</strong></div>
          <p>{order.recipient_name} · {order.address_line1}{order.address_line2 ? `, ${order.address_line2}` : ""}, {order.city}, {order.province} {order.postal_code}</p>
          <p>{order.items.map(item => `${item.name} (${money(item.priceCents)})`).join(" · ")}</p>
          <p>Items {money(order.subtotal_cents)} · Shipping {money(order.shipping_cents)} · Item tax {money(order.tax_cents)} · Total {money(order.total_cents)}</p>
          {order.tracking_number ? <p>Tracking: {order.tracking_number}</p> : null}
          {order.status === "awaiting_payment" ? <p>Prepared only. No payment was taken. Reservation expires {order.reservation_expires_at ? new Date(order.reservation_expires_at).toLocaleString("en-CA", { timeZone: "America/Toronto" }) : "—"}.</p> : null}
          {next && order.payment_status === "paid" ? <form action={progressOrder} className="admin-item-form"><input type="hidden" name="order" value={order.id}/><input type="hidden" name="status" value={next}/>{next === "shipped" ? <label>Carrier tracking number <input name="tracking" minLength={5} maxLength={80} required/></label> : null}<button type="submit">Mark {next}</button></form> : null}
          {order.returns.map(claim => <div key={claim.id}><p>Return: {claim.reason} · {claim.status}</p>{canReviewReturns && ["submitted","reviewing"].includes(claim.status) ? <form action={reviewReturn} className="admin-item-form"><input type="hidden" name="request" value={claim.id}/><select name="decision" required defaultValue=""><option value="" disabled>Review decision</option>{claim.status === "submitted" ? <option value="reviewing">Start review</option> : <><option value="approved">Approve review</option><option value="denied">Deny review</option></>}</select><button type="submit">Save review</button></form> : null}</div>)}
        </article>;
      }) : <section className="ops-card"><h2>No orders yet</h2><p>Prepared and paid orders will appear here when customers use checkout.</p></section>}
    </section>
  </main>;
}
