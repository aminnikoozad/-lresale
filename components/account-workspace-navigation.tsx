"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, Shirt, ShieldCheck } from "lucide-react";
import { Localize } from "@/components/site-language";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { accountWorkspaceFromPath, accountWorkspaceForNavigation, type AccountWorkspace } from "@/lib/account-workspaces";
import { accountNavigationFor } from "@/lib/workspace-navigation";
import { rememberAccountWorkspace, selectAccountWorkspace } from "@/app/account/workspace-actions";

export function AccountWorkspaceNavigation({ initialMode, showAdminPanel = false }: {initialMode: AccountWorkspace | null; showAdminPanel?: boolean}) {
  const pathname = usePathname();
  const pathMode = accountWorkspaceFromPath(pathname);
  const mode = accountWorkspaceForNavigation(pathname, initialMode);
  useEffect(() => {
    if (pathMode && pathMode !== initialMode) void rememberAccountWorkspace(pathMode).catch(() => {});
  }, [pathMode, initialMode]);
  return <Localize><div className="account-workspace-chrome">
    <div className="account-workspace-switch" role="group" aria-label="Switch account workspace">
      <div className="account-workspace-segments">
        <form action={selectAccountWorkspace}><input type="hidden" name="workspace" value="buyer" /><button type="submit" aria-pressed={mode === "buyer"}><ShoppingBag aria-hidden="true" /> Buyer</button></form>
        <form action={selectAccountWorkspace}><input type="hidden" name="workspace" value="seller" /><button type="submit" aria-pressed={mode === "seller"}><Shirt aria-hidden="true" /> Seller</button></form>
      </div>
      {showAdminPanel ? <Link href="/admin" className="account-admin-panel-link"><ShieldCheck aria-hidden="true" /> Admin panel</Link> : null}
    </div>
    <WorkspaceNavigation title={mode === "buyer" ? "Buyer account" : mode === "seller" ? "Seller account" : "Account"} links={accountNavigationFor(mode)} />
  </div></Localize>;
}
