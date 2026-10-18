
import { Localize } from "@/components/site-language";
import { cookies } from "next/headers";
import { AccountWorkspaceNavigation } from "@/components/account-workspace-navigation";
import { createClient } from "@/lib/supabase/server";
import { accountWorkspaceCookie, parseAccountWorkspace } from "@/lib/account-workspaces";
import "./batch-tracking.css";
import "./launch-offer.css";
import "./account.css";
import "./workspaces.css";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: adminData, error: adminError } = user
    ? await supabase.rpc("admin_access_context")
    : { data: null, error: null };
  const adminAccess = Array.isArray(adminData) ? adminData[0] : adminData;
  const showAdminPanel = Boolean(user && !adminError && adminAccess?.role);
  const mode = user ? parseAccountWorkspace((await cookies()).get(accountWorkspaceCookie(user.id))?.value) : null;
  return <Localize><AccountWorkspaceNavigation initialMode={mode} showAdminPanel={showAdminPanel} />{children}</Localize>;
}
