import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { SupportInboxClient } from "./support-inbox-client";
import "./support.css";

export const dynamic = "force-dynamic";

export default async function SupportInboxPage() {
  const { supabase, access } = await requireAdmin();
  const [{ data: supportContext }, { data: statsData }, { data: categoryRows }] = await Promise.all([
    supabase.rpc("support_admin_context"),
    supabase.rpc("support_admin_stats"),
    supabase.from("support_categories").select("name,parent_id,active,sort_order").is("parent_id", null).eq("active", true).order("sort_order"),
  ]);

  const context = Array.isArray(supportContext) ? supportContext[0] : supportContext;
  if (!context?.can_support) notFound();
  const stats = (Array.isArray(statsData) ? statsData[0] : statsData) ?? {
    total: 0, waiting: 0, human: 0, ai: 0, urgent: 0, resolved: 0, unknown_open: 0, kb_approved: 0, not_helpful: 0,
  };
  const categories = (categoryRows ?? []).map((row) => row.name as string);

  return (
    <main className="support-admin-shell">
      <header className="support-admin-top">
        <div><Link href="/admin" className="support-brand">REWEAR<span>.</span></Link><b>Support</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/support">Support Inbox</Link>
          <Link href="/admin/ai-trainer">AI Trainer</Link>
          <Link href="/admin/support/settings">Support Settings</Link>
          <Link href="/admin/operations">Operations</Link>
          <Link href="/admin/security">Security</Link>
        </nav>
      </header>
      <section className="support-admin-wrap">
        <div className="support-admin-heading">
          <div>
            <p className="eyebrow dark">Customer support operations</p>
            <h1>Support Inbox</h1>
            <p>AI-handled conversations, human handoffs, assignments and customer replies in one secure inbox. Customer-specific access remains enforced by the authenticated account and database policies.</p>
          </div>
          <div className="support-admin-chip">MFA verified · {access.role}</div>
        </div>
        <SupportInboxClient initialStats={stats} categories={categories} />
      </section>
    </main>
  );
}
