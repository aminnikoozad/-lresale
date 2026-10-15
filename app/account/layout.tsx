
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
  const mode = user ? parseAccountWorkspace((await cookies()).get(accountWorkspaceCookie(user.id))?.value) : null;
  return <Localize><AccountWorkspaceNavigation initialMode={mode} />{children}</Localize>;
}
