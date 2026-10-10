export type WorkspaceLink = { href: string; label: string };
export type MenuAccess = {
  can_manage_items?: boolean;
  can_manage_pickups?: boolean;
  can_manage_shipping?: boolean;
  can_manage_selling_rules?: boolean;
  can_support?: boolean;
  ai_view?: boolean;
  has_aal2?: boolean;
};
export const accountNavigation: WorkspaceLink[] = [
  { href: "/account", label: "Selling dashboard" },
  { href: "/account/operations", label: "Item tracking" },
  { href: "/account/purchases", label: "Purchases & saved" },
  { href: "/account/profile", label: "Profile & messages" },
];
export function adminNavigation(access: MenuAccess): WorkspaceLink[] {
  return [
    { href: "/admin", label: "Dashboard" },
    ...(access.can_manage_items ? [
      { href: "/admin/customers", label: "Customers" },
      { href: "/admin/items", label: "Items" },
      { href: "/admin/processing", label: "Processing" },
      { href: "/admin/home-decor", label: "Home inventory" },
    ] : []),
    ...(access.can_manage_pickups || access.can_manage_shipping ? [{ href: "/admin/operations", label: "Operations" }] : []),
    ...(access.can_manage_pickups ? [{ href: "/admin/operations#pickup-requests", label: "Pickup inbox" }] : []),
    ...(access.can_manage_shipping ? [{ href: "/admin/orders", label: "Orders" }, { href: "/admin/postal", label: "Postal shipping" }] : []),
    ...(access.can_manage_selling_rules ? [{ href: "/admin/pilot", label: "Pilot" }, { href: "/admin/settings", label: "Selling rules" }] : []),
    ...(access.can_support ? [{ href: "/admin/support", label: "Support" }, { href: "/admin/support/settings", label: "Support settings" }] : []),
    ...(access.ai_view ? [{ href: "/admin/ai-trainer", label: "AI trainer" }] : []),
    { href: "/admin/readiness", label: "Readiness" },
    { href: "/admin/security", label: "My security" },
    ...(!access.has_aal2 ? [{ href: "/admin/mfa", label: "Verify MFA" }] : []),
  ];
}
export function isWorkspaceLinkActive(pathname: string, href: string, links: WorkspaceLink[]) {
  if (href.includes("#")) return false;
  const candidates = links.filter((link) => !link.href.includes("#") && (pathname === link.href || pathname.startsWith(`${link.href}/`)));
  return candidates.sort((a, b) => b.href.length - a.href.length)[0]?.href === href;
}
