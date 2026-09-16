"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, HeartHandshake, PackageCheck, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./account-resale-insights.module.css";

type ItemRow = {
  id: string;
  name: string;
  brand: string | null;
  status: string;
  item_condition: string | null;
  inspected_at: string | null;
  seller_pricing_approved_at: string | null;
  published_at: string | null;
  seller_disposition_preference: "return" | "donate" | null;
};

type WalletRow = { amount_cents: number; transaction_type: string; status: string };

type Props = {
  sellingPeriodDays: number;
  minimumItemValue: string;
  freePickupThreshold: string;
  lowValuePickupFee: string;
  storeCreditBonusBps: number;
};

const journey = ["Received", "Inspection", "Pricing", "Approved", "Listed", "Sold", "Paid"];

function stageFor(item: ItemRow) {
  const status = item.status.toLowerCase();
  if (status === "paid") return 6;
  if (status === "sold") return 5;
  if (["listed", "reserved"].includes(status) || item.published_at) return 4;
  if (item.seller_pricing_approved_at) return 3;
  if (["accepted", "waiting_for_seller_approval", "bundle_candidate", "manual_review"].includes(status)) return 2;
  if (item.inspected_at) return 1;
  return 0;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function daysLeft(publishedAt: string | null, sellingPeriodDays: number) {
  if (!publishedAt) return null;
  const elapsed = Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86400000);
  return Math.max(0, sellingPeriodDays - elapsed);
}

export function AccountResaleInsights(props: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [wallet, setWallet] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) { if (active) setLoading(false); return; }
      const [itemResult, walletResult] = await Promise.all([
        supabase.from("items").select("id,name,brand,status,item_condition,inspected_at,seller_pricing_approved_at,published_at,seller_disposition_preference").eq("owner_id", user.id).order("created_at", { ascending: false }),
        supabase.from("wallet_transactions").select("amount_cents,transaction_type,status").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setItems((itemResult.data ?? []) as ItemRow[]);
      setWallet((walletResult.data ?? []) as WalletRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [supabase]);

  const walletSummary = useMemo(() => {
    let available = 0, pending = 0, paid = 0;
    for (const row of wallet) {
      if (row.status === "pending") pending += row.amount_cents;
      if (row.status === "completed") available += row.amount_cents;
      if (row.status === "completed" && ["payout", "withdrawal"].includes(row.transaction_type)) paid += Math.abs(row.amount_cents);
    }
    return { available, pending, paid };
  }, [wallet]);

  async function savePreference(itemId: string, preference: "return" | "donate") {
    setSaving(itemId);
    setNotice(null);
    const { error } = await supabase.rpc("set_item_disposition_preference", { target_item_id: itemId, target_preference: preference });
    if (error) setNotice(error.message);
    else {
      setItems((current) => current.map((item) => item.id === itemId ? { ...item, seller_disposition_preference: preference } : item));
      setNotice("Preference saved. This records your choice; Rewear will confirm the final handling when the item reaches that stage.");
    }
    setSaving(null);
  }

  if (loading) return <section className={styles.shell}><div className={styles.loading}>Loading resale progress…</div></section>;

  return (
    <section className={styles.shell} aria-labelledby="resale-progress-title">
      <div className={styles.heading}>
        <div><p>Managed resale</p><h2 id="resale-progress-title">Track every step with Rewear.</h2></div>
        <span><ShieldCheck /> Staff-reviewed listings</span>
      </div>

      <div className={styles.walletGrid}>
        <article><WalletCards/><span>Available</span><strong>{money(walletSummary.available)}</strong><small>Completed wallet transactions</small></article>
        <article><Clock3/><span>Pending</span><strong>{money(walletSummary.pending)}</strong><small>Recorded transactions not completed yet</small></article>
        <article><CheckCircle2/><span>Paid out</span><strong>{money(walletSummary.paid)}</strong><small>Completed payout/withdrawal records</small></article>
      </div>
      {props.storeCreditBonusBps > 0 ? <div className={styles.creditNote}>Using Rewear Credit currently includes a {(props.storeCreditBonusBps / 100).toFixed(2).replace(/\.00$/, "")}% configured bonus when that payment option is available.</div> : null}

      <div className={styles.eligibility}>
        <PackageCheck />
        <div><h3>Quick eligibility check before pickup</h3><p>Items are only finally accepted after Rewear inspection.</p>
          <ul><li>Individual resale value is normally {props.minimumItemValue}+</li><li>{props.freePickupThreshold}+ estimated collection qualifies for free priority pickup</li><li>Below that threshold, the current pickup fee is {props.lowValuePickupFee} per item</li><li>Clothing should be clean and free of serious stains, tears, holes or missing parts</li><li>Electronics should power on, be owned by you, and have passwords / activation locks removed</li></ul>
        </div>
      </div>

      <div className={styles.items}>
        {items.length ? items.map((item) => {
          const stage = stageFor(item);
          const remaining = daysLeft(item.published_at, props.sellingPeriodDays);
          const showPreference = !["sold", "paid"].includes(item.status.toLowerCase());
          return <article className={styles.item} key={item.id}>
            <header><div><small>{item.brand || "Rewear item"}</small><h3>{item.name}</h3></div><div className={styles.badges}>{item.inspected_at ? <span className={styles.inspected}>Inspected by REWEAR</span> : <span>Inspection pending</span>}{remaining !== null && remaining <= 21 ? <span className={styles.lastChance}>Last chance · {remaining} days left</span> : null}</div></header>
            <div className={styles.condition}><b>Condition</b><span>{item.item_condition || "Pending review"}</span></div>
            <div className={styles.timeline}>{journey.map((label, index) => <div key={label} className={index <= stage ? styles.done : ""}><i/><span>{label}</span></div>)}</div>
            {item.status.toLowerCase() === "rejected" ? <div className={styles.rejected}>This item was not approved for resale. Choose how you prefer Rewear to handle it; the team will confirm the operational next step.</div> : null}
            {showPreference ? <div className={styles.preference}><div><b>Unsold / rejected item preference</b><span>This records your preference; it does not create a shipping or donation transaction by itself.</span></div><button type="button" disabled={saving === item.id} className={item.seller_disposition_preference === "return" ? styles.selected : ""} onClick={() => void savePreference(item.id, "return")}><RotateCcw/> Return to me</button><button type="button" disabled={saving === item.id} className={item.seller_disposition_preference === "donate" ? styles.selected : ""} onClick={() => void savePreference(item.id, "donate")}><HeartHandshake/> Donate</button></div> : null}
          </article>;
        }) : <div className={styles.empty}>Your item journey will appear here after Rewear receives items for your account.</div>}
      </div>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
    </section>
  );
}
