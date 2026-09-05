"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, Bot, Clock3, Headphones, Search, ShieldAlert, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type InboxRow = {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_code: string | null;
  subject: string;
  status: string;
  priority: string;
  category: string;
  subcategory: string;
  assigned_to: string | null;
  assigned_name: string | null;
  human_requested: boolean;
  ai_enabled: boolean;
  last_message: string | null;
  last_message_kind: string | null;
  last_message_at: string;
  waiting_seconds: number;
};

type Stats = { total:number; waiting:number; human:number; ai:number; urgent:number; resolved:number; unknown_open:number; kb_approved:number; not_helpful:number };

const filters = [
  ["all", "All"], ["new", "New"], ["waiting", "Waiting for Human"], ["mine", "Assigned to Me"],
  ["ai", "AI Handling"], ["urgent", "Urgent"], ["resolved", "Resolved"], ["closed", "Closed"],
] as const;

function waitingText(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function SupportInboxClient({ initialStats, categories }: { initialStats: Stats; categories: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error: inboxError }, { data: statData }] = await Promise.all([
      supabase.rpc("support_admin_inbox", { p_filter: filter, p_query: query.trim() || null, p_category: category || null, p_limit: 150 }),
      supabase.rpc("support_admin_stats"),
    ]);
    if (inboxError) setError(inboxError.message); else { setRows((data ?? []) as InboxRow[]); setError(null); }
    const stat = Array.isArray(statData) ? statData[0] : statData;
    if (stat) setStats(stat as Stats);
    setLoading(false);
  }, [category, filter, query, supabase]);

  useEffect(() => { const t=setTimeout(() => void load(), query ? 220 : 0); return () => clearTimeout(t); }, [load, query]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-support-inbox-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_notifications" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, supabase]);

  return (
    <>
      <section className="support-stat-grid">
        <article><Headphones/><div><b>{stats.waiting}</b><span>Waiting for human</span></div></article>
        <article><UserRound/><div><b>{stats.human}</b><span>Human handling</span></div></article>
        <article><Bot/><div><b>{stats.ai}</b><span>AI handling</span></div></article>
        <article className={stats.urgent ? "urgent" : ""}><ShieldAlert/><div><b>{stats.urgent}</b><span>Urgent open</span></div></article>
        <article><BellRing/><div><b>{stats.unknown_open}</b><span>Training needed</span></div></article>
      </section>

      <section className="support-inbox-card">
        <div className="support-inbox-tools">
          <div className="support-filter-tabs">
            {filters.map(([key,label]) => <button key={key} className={filter===key?"active":""} type="button" onClick={()=>setFilter(key)}>{label}</button>)}
          </div>
          <div className="support-search-row">
            <label><Search/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Name, email, phone, customer ID, conversation, pickup, item or keyword" /></label>
            <select value={category} onChange={(e)=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map((c)=><option key={c} value={c}>{c}</option>)}</select>
          </div>
        </div>

        {error ? <div className="support-admin-error">{error}</div> : null}
        {loading && !rows.length ? <div className="support-admin-empty">Loading support inbox…</div> : null}
        {!loading && !rows.length ? <div className="support-admin-empty"><Headphones/><h3>No conversations in this view</h3><p>New authenticated customer chats will appear here automatically.</p></div> : null}

        <div className="support-inbox-list">
          {rows.map((row) => (
            <Link key={row.id} href={`/admin/support/${row.id}`} className={`support-inbox-row priority-${row.priority}`}>
              <div className="support-inbox-customer">
                <strong>{row.customer_name || row.customer_email || "Customer"}</strong>
                <span>{row.customer_code ? `#${row.customer_code}` : row.customer_email || row.id.slice(0,8)}</span>
              </div>
              <div className="support-inbox-topic"><b>{row.category} <span>›</span> {row.subcategory}</b><p>{row.last_message || row.subject}</p></div>
              <div className="support-inbox-assignment"><span>{row.assigned_name ? `Assigned: ${row.assigned_name}` : row.status === "ai" ? "AI Assistant" : "Unassigned"}</span><small>{row.priority.toUpperCase()}</small></div>
              <div className="support-inbox-wait"><Clock3/><b>{waitingText(Number(row.waiting_seconds || 0))}</b><span>{row.status.replaceAll("_"," ")}</span></div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
