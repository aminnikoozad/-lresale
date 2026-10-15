"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ShoppingBag, Shirt, LayoutGrid } from "lucide-react";
import { Localize } from "@/components/site-language";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { accountWorkspaceFromPath, accountWorkspaceForNavigation, type AccountWorkspace } from "@/lib/account-workspaces";
import { accountNavigationFor } from "@/lib/workspace-navigation";
import { rememberAccountWorkspace, selectAccountWorkspace } from "@/app/account/workspace-actions";

export function AccountWorkspaceNavigation({ initialMode }: {initialMode: AccountWorkspace | null}) {
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
      <Link href="/account?choose=1" aria-label="Choose workspace"><LayoutGrid aria-hidden="true" /><span>Choose workspace</span></Link>
    </div>
    <WorkspaceNavigation title={mode === "buyer" ? "Buyer account" : mode === "seller" ? "Seller account" : "Account"} links={accountNavigationFor(mode)} />
  </div></Localize>;
}
