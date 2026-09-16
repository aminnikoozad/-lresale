import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadSellingRules } from "@/lib/business-rules";
import styles from "./item.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };
type Detail = {
  item_id: string;
  name: string;
  brand: string;
  category: string;
  size: string | null;
  item_condition: string | null;
  photo_urls: string[] | null;
  description: string | null;
  price_cents: number;
  published_at: string | null;
  inspected_at: string | null;
  inspection_notes: string | null;
  inspection_checks: Record<string, boolean> | null;
};

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase()); }
function daysLeft(publishedAt: string | null, total: number) {
  if (!publishedAt) return null;
  return Math.max(0, total - Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86400000));
}
const checkLabels: Record<string,string> = {
  clean: "Clean / presentation checked",
  stains: "Stains checked",
  tears: "Tears, holes and missing parts checked",
  hardware: "Zippers, buttons and hardware checked",
  conditionGrade: "Condition grade reviewed",
  physicalCondition: "Physical condition checked",
  powersOn: "Power-on / basic function checked",
  screenBody: "Screen and body checked",
  ownership: "Ownership / serial or IMEI reviewed where applicable",
  activationLock: "Passwords and activation lock removed",
};

export default async function ItemPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data, error }, rules] = await Promise.all([
    supabase.rpc("catalog_item_detail", { target_item_id: id }),
    loadSellingRules(supabase),
  ]);
  if (error) console.error("[item] detail load failed", { code: error.code, message: error.message });
  const row = (Array.isArray(data) ? data[0] : data) as Detail | undefined;
  if (!row) notFound();
  const photos = row.photo_urls ?? [];
  const remaining = daysLeft(row.published_at, rules.sellingPeriodDays);
  const checks = Object.entries(row.inspection_checks ?? {}).filter(([, value]) => value);

  return <main className={styles.page}>
    <header className={styles.top}><Link className={styles.brand} href="/">REWEAR<span>.</span></Link><Link href="/#shop">← Back to shop</Link></header>
    <div className={styles.main}>
      <section className={styles.gallery} aria-label={`${row.name} photos`}>
        {photos.length ? photos.map((url, index) => <div className={styles.photo} key={`${url}-${index}`}><Image src={url} alt={`${row.brand} ${row.name} photo ${index + 1}`} fill sizes="(max-width:850px) 50vw, 42vw" priority={index === 0}/></div>) : <div className={styles.photo}/>} 
      </section>
      <aside className={styles.info}>
        <p className={styles.eyebrow}>{row.brand}</p><h1>{row.name}</h1><strong className={styles.price}>{cad(row.price_cents)}</strong>
        <div className={styles.meta}><span>{row.item_condition || "Condition reviewed"}</span><span>{row.size ? `Size ${row.size}` : title(row.category)}</span>{remaining !== null && remaining <= 21 ? <span className={styles.last}>Last chance · {remaining} days left</span> : null}</div>
        <section className={styles.inspection}>
          <div className={styles.inspectionHead}><ShieldCheck/><h2>{row.inspected_at ? "Inspected by REWEAR" : "REWEAR listing review"}</h2></div>
          <p>{row.inspection_notes || "This managed listing was prepared by Rewear staff. The condition grade above reflects the recorded review."}</p>
          {checks.length ? <div className={styles.checks}>{checks.map(([key]) => <div key={key}><CheckCircle2/><span>{checkLabels[key] || title(key)}</span></div>)}</div> : null}
        </section>
        {row.description ? <section className={styles.description}><h2>Item details</h2><p>{row.description}</p></section> : null}
        <section className={styles.delivery}><h2>Delivery</h2><p>Canada-wide delivery follows the current Rewear shipping policy. Eligible local delivery is confirmed from the delivery address.</p></section>
        <div className={styles.links}><Link className={styles.primary} href="/shipping-policy">Delivery details</Link><Link className={styles.secondary} href="/account">My account &amp; support</Link></div>
      </aside>
    </div>
  </main>;
}
