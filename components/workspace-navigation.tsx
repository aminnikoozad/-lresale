"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { logout } from "@/app/auth/actions";
import { isWorkspaceLinkActive, type WorkspaceLink } from "@/lib/workspace-navigation";

export function WorkspaceNavigation({ title, links }: { title: string; links: WorkspaceLink[] }) {
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [expandedAt, setExpandedAt] = useState<string | null>(null);
  const open = expandedAt === pathname;
  const id = title === "Admin" ? "admin-workspace-links" : "account-workspace-links";
  return <header className="workspace-navigation" onKeyDown={(event) => { if (event.key === "Escape") { setExpandedAt(null); menuButton.current?.focus(); } }}>
    <div className="workspace-navigation-heading">
      <span><Link href="/" aria-label="REWEAR shop">REWEAR.</Link><strong>{title}</strong></span>
      <button ref={menuButton} className="workspace-menu-toggle" type="button" aria-controls={id} aria-expanded={open} onClick={() => setExpandedAt(open ? null : pathname)}>Menu <ChevronDown aria-hidden="true" /></button>
    </div>
    <div id={id} className="workspace-navigation-panel" data-open={open}>
      <nav aria-label={`${title} sections`}>
        {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setExpandedAt(null)} aria-current={isWorkspaceLinkActive(pathname, link.href, links) ? "page" : undefined}>{link.label}</Link>)}
      </nav>
      <div className="workspace-navigation-exit"><Link href="/">Back to shop</Link><form action={logout}><button type="submit"><LogOut aria-hidden="true" /> Sign out</button></form></div>
    </div>
  </header>;
}
