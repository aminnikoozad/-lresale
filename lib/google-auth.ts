import "server-only";
import { getSupabaseConfig } from "./supabase/config";
export async function isGoogleSignInEnabled() {
  const { url, publishableKey } = getSupabaseConfig();
  try {
    const response = await fetch(url + "/auth/v1/settings", { headers: { apikey: publishableKey }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const settings = await response.json();
    return settings.external?.google === true;
  } catch { return false; }
}
