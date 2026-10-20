import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
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
  searchParams: Promise<{ after?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { after } = await searchParams;
  const cursor = after && /^[0-9a-f-]{36}$/i.test(after) ? after : null;
  const { data, error } = await supabase.rpc("admin_pricing_queue", {
    after_id: cursor,
  });
  if (error)
    throw new Error(
      "Pricing queue unavailable. Confirm the pricing migration and staff MFA.",
    );
  const rows = (data ?? []) as Row[];
  return (
    <main className="pricing-shell">
      <nav className="pricing-nav">
        <Link href="/admin/items">← Items</Link>
        <Link href="/admin/pricing">First page</Link>
      </nav>
      <h1>Pricing queue</h1>
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
    </main>
  );
}
