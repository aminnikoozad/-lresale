import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadSellingRules } from "@/lib/business-rules";
import { InspectionEditor } from "./inspection-editor";
import styles from "./quality.module.css";

export const dynamic = "force-dynamic";

type Row = {
  item_id: string;
  name: string;
  brand: string | null;
  category: string;
  item_condition: string | null;
  status: string;
  initial_price_cents: number | null;
  listed_price_cents: number | null;
  seller_approved_at: string | null;
  published_at: string | null;
  inspected_at: string | null;
  inspection_notes: string | null;
  inspection_checks: Record<string, boolean> | null;
  seller_disposition_preference: string | null;
  suggested_price_cents: number | null;
  suggested_price_sample_size: number;
};

function cad(cents: number | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase()); }
function daysLeft(publishedAt: string | null, sellingDays: number) {
  if (!publishedAt) return null;
  return Math.max(0, sellingDays - Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86400000));
}

export default async function ResaleQualityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: allowed }, { data, error }, rules] = await Promise.all([
    supabase.rpc("can_manage_items"),
    supabase.rpc("admin_item_list_v3"),
    loadSellingRules(supabase),
  ]);
  if (!allowed) redirect("/account");
  const items = (data ?? []) as Row[];
  const inspected = items.filter((item) => item.inspected_at).length;
  const pricingSignals = items.filter((item) => item.suggested_price_cents != null).length;

  return <main className={styles.page}><div className={styles.wrap}>
    <section className={styles.hero}>
      <div><p>Managed resale quality</p><h1>Inspection &amp; pricing workspace</h1><span>Standardize condition grades, record customer-facing inspection notes, and use completed Rewear sales as a pricing signal. A price signal is guidance only; seller approval and the existing commission rules still control the listing.</span></div>
      <div className={styles.summary}><div><strong>{items.length}</strong><span>items</span></div><div><strong>{inspected}</strong><span>inspected</span></div><div><strong>{pricingSignals}</strong><span>with pricing data</span></div></div>
    </section>

    {error ? <div className={styles.empty}>Item data could not be loaded: {error.message}</div> : null}
    <section className={styles.grid}>
      {items.length ? items.map((item) => {
        const remaining = daysLeft(item.published_at, rules.sellingPeriodDays);
        return <article className={styles.card} key={item.item_id}>
          <div className={styles.cardHead}><div><small>{item.brand || "Unbranded"} · {label(item.category)}</small><h2>{item.name}</h2></div><div className={styles.badges}><span>{label(item.status)}</span><span className={item.inspected_at ? styles.ready : styles.needs}>{item.inspected_at ? "Inspection complete" : "Inspection required"}</span>{remaining !== null && remaining <= 21 ? <span className={styles.needs}>Last chance · {remaining} days</span> : null}</div></div>
          <div className={styles.facts}>
            <div><span>Initial approved</span><strong>{cad(item.initial_price_cents)}</strong></div>
            <div><span>Current listing</span><strong>{cad(item.listed_price_cents)}</strong></div>
            <div><span>Condition</span><strong>{item.item_condition || "Pending"}</strong></div>
            <div><span>Seller approval</span><strong>{item.seller_approved_at ? "Approved" : "Pending"}</strong></div>
            <div><span>End preference</span><strong>{item.seller_disposition_preference ? label(item.seller_disposition_preference) : "Not chosen"}</strong></div>
          </div>
          {item.suggested_price_cents != null ? <div className={styles.signal}><b>Historical pricing signal:</b> {cad(item.suggested_price_cents)} median from {item.suggested_price_sample_size} comparable completed sale{item.suggested_price_sample_size === 1 ? "" : "s"}. Use judgment for condition, model, demand and season.</div> : <div className={styles.signal}><b>Historical pricing signal:</b> not enough comparable completed Rewear sales yet. Use manual market judgment until internal sale history grows.</div>}
          <InspectionEditor itemId={item.item_id} category={item.category} condition={item.item_condition} notes={item.inspection_notes} checks={item.inspection_checks}/>
        </article>;
      }) : <div className={styles.empty}>No managed items are available yet.</div>}
    </section>
  </div></main>;
}
