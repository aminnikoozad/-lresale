import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin-auth";
import { adminNavigation } from "@/lib/workspace-navigation";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { AdminNotificationBridge } from "./admin-notification-bridge";
import "./admin-notification.css";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // MFA page must remain reachable to perform step-up. Page/action guards remain authoritative.
  const { supabase, access } = await requireAdmin({ requireMfa: false });
  const [items, rules, support] = await Promise.all([
    supabase.rpc("can_manage_items"), supabase.rpc("can_manage_selling_rules"), supabase.rpc("support_admin_context"),
  ]);
  const context = support.error ? null : Array.isArray(support.data) ? support.data[0] : support.data;
  const links = adminNavigation({ ...access, can_manage_items: !items.error && items.data === true,
    can_manage_selling_rules: !rules.error && rules.data === true, can_support: context?.can_support === true, ai_view: context?.ai_view === true });
  return <div className="admin-workspace"><WorkspaceNavigation title="Admin" links={links} />{children}<AdminNotificationBridge /></div>;
}
