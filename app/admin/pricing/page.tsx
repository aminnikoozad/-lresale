import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { Localize } from "@/components/site-language";
import { setPricingEnabled } from "./actions";
import "../items/[id]/pricing/pricing.css";
export const dynamic = "force-dynamic";
type Row = {
  id: string;
  name: string;
  brand: string | null;
  status: string;
  inspected_at: string | null;
  pricing_approval_id: string | null;
  review_due: boolean;
};
export default async function PricingQueue({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; message?: string; type?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { after, message, type } = await searchParams;
  const cursor = after && /^[0-9a-f-]{36}$/i.test(after) ? after : null;
  const [controls, { data, error }] = await Promise.all([
    supabase.rpc("admin_pricing_control"),
    supabase.rpc("admin_pricing_queue", { after_id: cursor }),
  ]);
  if (controls.error || !controls.data)
    throw new Error("Pricing controls unavailable. Confirm staff MFA and migrations.");
  const control = controls.data as {
    enabled: boolean; version: number; canManage: boolean;
    history: Array<{ version: number; value: { enabled: boolean }; reason: string; effective_at: string }>;
  };
  if (error)
    throw new Error(
      "Pricing queue unavailable. Confirm the pricing migration and staff MFA.",
    );
  const rows = (data ?? []) as Row[];
  return (
    <Localize><main className="pricing-shell">
      <nav className="pricing-nav">
        <Link href="/admin/items">← Items</Link>
        <Link href="/admin/pricing">First page</Link>
      </nav>
      <h1>AI Pricing</h1>
      {message ? <p role="status" className={type === "error" ? "pricing-warning" : "pricing-notice"}>{message}</p> : null}
      <section className="pricing-card">
        <h2>Smart pricing suggestions</h2>
        <p><strong>{control.enabled ? "ON" : "OFF"}</strong></p>
        <p>Turning suggestions off pauses analyses. Manual price approval stays available, and every final price still requires an admin decision.</p>
        {control.canManage ? <form action={setPricingEnabled} className="pricing-form">
          <input type="hidden" name="version" value={control.version} />
          <input type="hidden" name="enabled" value={String(!control.enabled)} />
          <label>Reason for change<textarea name="reason" minLength={10} maxLength={500} required /></label>
          <button type="submit" role="switch" aria-checked={control.enabled} aria-label="Smart pricing suggestions">{control.enabled ? "Turn suggestions off" : "Turn suggestions on"}</button>
        </form> : <p>Only an owner or admin with MFA can change this setting.</p>}
        <details><summary>Control history</summary><ol>{control.history.map(h => <li key={h.version}><strong>{h.value.enabled ? "ON" : "OFF"}</strong> · <time dateTime={h.effective_at}>{new Date(h.effective_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}</time><p translate="no">{h.reason}</p></li>)}</ol></details>
      </section>
      <p>
        Review inspected items, approve prices and follow up on unsold stock.
      </p>
      <section className="pricing-card">
        <div className="pricing-table-wrap">
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Inspection</th>
                <th>Pricing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/items/${r.id}/pricing`}>{r.name}</Link>
                    <br />
                    {r.brand}
                  </td>
                  <td>{r.status}</td>
                  <td>{r.inspected_at ? "Recorded" : "Required"}</td>
                  <td>
                    {r.review_due
                      ? "Unsold review due"
                      : r.pricing_approval_id
                        ? "Approved"
                        : "Needs admin approval"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length ? <p>No items on this page.</p> : null}
      </section>
      {rows.length === 50 ? (
        <Link href={`/admin/pricing?after=${rows[49].id}`}>
          Next 50 items →
        </Link>
      ) : null}
    </main></Localize>
  );
}
