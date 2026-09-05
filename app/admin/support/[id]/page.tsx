import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { SupportThreadClient } from "./support-thread-client";
import "../support.css";

export const dynamic = "force-dynamic";

export default async function SupportConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access } = await requireAdmin();
  const [{ data: contextData }, { data: conversationData }, { data: messages }, { data: notes }, { data: admins }, { data: parentCategories }] = await Promise.all([
    supabase.rpc("support_admin_context"),
    supabase.rpc("support_admin_conversation", { p_conversation_id: id }),
    supabase.from("support_messages").select("id,conversation_id,sender_id,sender_kind,sender_display_name,body,ai_confidence,customer_helpful,created_at,metadata").eq("conversation_id", id).order("created_at"),
    supabase.from("support_internal_notes").select("id,author_id,body,created_at").eq("conversation_id", id).order("created_at", { ascending: false }),
    supabase.rpc("support_admin_list"),
    supabase.from("support_categories").select("id,name,code,sort_order").is("parent_id", null).eq("active", true).order("sort_order"),
  ]);
  const context = Array.isArray(contextData) ? contextData[0] : contextData;
  if (!context?.can_support) notFound();
  const conversation = Array.isArray(conversationData) ? conversationData[0] : conversationData;
  if (!conversation) notFound();

  const parentIds = (parentCategories ?? []).map((row) => row.id);
  const { data: children } = parentIds.length
    ? await supabase.from("support_categories").select("id,parent_id,name,code,sort_order").in("parent_id", parentIds).eq("active", true).order("sort_order")
    : { data: [] as never[] };
  const { data: history } = await supabase
    .from("support_conversations")
    .select("id,subject,status,category,subcategory,last_message_at")
    .eq("customer_id", conversation.customer_id)
    .neq("id", id)
    .order("last_message_at", { ascending: false })
    .limit(8);

  return (
    <main className="support-admin-shell">
      <header className="support-admin-top">
        <div><Link href="/admin" className="support-brand">REWEAR<span>.</span></Link><b>Support</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/support">Support Inbox</Link>
          <Link href="/admin/ai-trainer">AI Trainer</Link>
          <Link href="/admin/support/settings">Support Settings</Link>
        </nav>
      </header>
      <section className="support-admin-wrap">
        <div className="support-admin-heading">
          <div><p className="eyebrow dark">Conversation</p><h1>{conversation.customer_name || "Customer"}</h1><p>{conversation.category} › {conversation.subcategory} · Conversation {id.slice(0, 8).toUpperCase()}</p></div>
          <div className="support-admin-chip">MFA verified · {access.role}</div>
        </div>
        <SupportThreadClient
          initialConversation={conversation}
          initialMessages={messages ?? []}
          initialNotes={notes ?? []}
          admins={admins ?? []}
          parentCategories={parentCategories ?? []}
          childCategories={children ?? []}
          customerHistory={history ?? []}
          permissions={context}
        />
      </section>
    </main>
  );
}
