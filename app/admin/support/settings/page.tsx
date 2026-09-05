import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { SupportSettingsClient } from "./settings-client";
import "../support.css";

export const dynamic="force-dynamic";

export default async function SupportSettingsPage(){
  const {supabase,access}=await requireAdmin();
  const [{data:contextData},{data:prefs},{data:hours}]=await Promise.all([
    supabase.rpc("support_admin_context"),
    supabase.from("admin_notification_preferences").select("*").maybeSingle(),
    supabase.from("support_business_hours").select("day_of_week,enabled,opens_at,closes_at,timezone").order("day_of_week")
  ]);
  const context=Array.isArray(contextData)?contextData[0]:contextData;if(!context?.can_support)notFound();
  return <main className="support-admin-shell"><header className="support-admin-top"><div><Link href="/admin" className="support-brand">REWEAR<span>.</span></Link><b>Support Settings</b></div><nav><Link href="/admin">Dashboard</Link><Link href="/admin/support">Support Inbox</Link><Link href="/admin/ai-trainer">AI Trainer</Link><Link href="/admin/support/settings">Support Settings</Link></nav></header><section className="support-admin-wrap"><div className="support-admin-heading"><div><p className="eyebrow dark">Support operations</p><h1>Availability & Notifications</h1><p>Set your support status, personal notification preferences and configurable support hours. Core support does not depend on SMS, WhatsApp or Telegram.</p></div><div className="support-admin-chip">MFA verified · {access.role}</div></div><SupportSettingsClient userId={context.user_id} displayName={context.display_name} initialAvailability={context.availability_status} initialPreferences={prefs} initialHours={hours??[]}/></section></main>
}
