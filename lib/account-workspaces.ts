export type AccountWorkspace = "buyer" | "seller";

export function parseAccountWorkspace(value: unknown): AccountWorkspace | null {
  return value === "buyer" || value === "seller" ? value : null;
}

export function accountWorkspaceDestination(mode: AccountWorkspace) {
  return mode === "buyer" ? "/account/buyer" : "/account/seller";
}

export function accountWorkspaceFromPath(pathname: string): AccountWorkspace | null {
  for (const mode of ["buyer", "seller"] as const) {
    const root = accountWorkspaceDestination(mode);
    if (pathname === root || pathname.startsWith(`${root}/`)) return mode;
  }
  return null;
}

// A display preference only. It never grants database or administrative access.
// Scope it to the authenticated user so a shared browser cannot mix preferences.
export function accountWorkspaceForNavigation(pathname: string, preference: unknown): AccountWorkspace | null {
  return accountWorkspaceFromPath(pathname) ?? (pathname === "/account" ? null : parseAccountWorkspace(preference));
}

export function accountWorkspaceCookie(userId: string) {
  return `shikimomo-account-workspace-${userId}`;
}

export function accountEntryDestination(preference: unknown, chooseAgain: boolean) {
  const mode = parseAccountWorkspace(preference);
  return !chooseAgain && mode ? accountWorkspaceDestination(mode) : null;
}

export function legacyAccountDestination(path: string, params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, entry);
  }
  return `${path}${query.size ? `?${query}` : ""}`;
}
