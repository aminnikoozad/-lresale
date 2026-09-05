import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { AiTrainerClient } from "./trainer-client";
import "../support/support.css";

export const dynamic = "force-dynamic";

export default async function AiTrainerPage() {
  const { supabase, access } = await requireAdmin();
  const [{ data: contextData }, { data: statsData }, { data: knowledge }, { data: drafts }, { data: unknown }, { data: rules }, { data: categories }] = await Promise.all([
    supabase.rpc("support_admin_context"),
    supabase.rpc("support_admin_stats"),
    supabase.from("knowledge_base").select("id,title,approved_answer,category_code,tags,status,updated_at").order("updated_at", { ascending: false }).limit(100),
    supabase.from("ai_training_drafts").select("id,draft_type,source_kind,proposed_title,proposed_category_code,proposed_answer,proposed_rule,conflict_with,status,review_note,created_at").in("status", ["pending", "draft"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("unknown_questions").select("id,customer_question,suggested_category_code,similar_count,training_priority,status,created_at").eq("status", "open").order("training_priority", { ascending: false }).order("similar_count", { ascending: false }).limit(50),
    supabase.from("ai_behavior_rules").select("id,rule_name,instruction,priority,status,updated_at").order("priority", { ascending: false }).limit(100),
    supabase.from("support_categories").select("code,name,parent_id").eq("active", true).order("sort_order"),
  ]);
  const context = Array.isArray(contextData) ? contextData[0] : contextData;
  if (!context?.ai_view) notFound();
  const stats = (Array.isArray(statsData) ? statsData[0] : statsData) ?? { total:0,waiting:0,human:0,ai:0,urgent:0,resolved:0,unknown_open:0,kb_approved:0,not_helpful:0 };

  return <main className="support-admin-shell">
    <header className="support-admin-top">
      <div><Link href="/admin" className="support-brand">REWEAR<span>.</span></Link><b>AI Trainer</b></div>
      <nav><Link href="/admin">Dashboard</Link><Link href="/admin/support">Support Inbox</Link><Link href="/admin/ai-trainer">AI Trainer</Link><Link href="/admin/support/settings">Support Settings</Link></nav>
    </header>
    <section className="support-admin-wrap">
      <div className="support-admin-heading"><div><p className="eyebrow dark">Controlled AI improvement</p><h1>Teach the Bot</h1><p>Chat with the support AI, test current approved answers, review gaps, and propose changes. Trainer conversation is separate from official knowledge; nothing becomes customer-facing until explicitly approved.</p></div><div className="support-admin-chip">MFA verified · {access.role}</div></div>
      <AiTrainerClient initialKnowledge={knowledge ?? []} initialDrafts={drafts ?? []} initialUnknown={unknown ?? []} initialRules={rules ?? []} categories={categories ?? []} stats={stats} permissions={context} />
    </section>
  </main>;
}
