import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "./admin-tools.module.css";

type AdminContext = {
  role: string;
  require_mfa: boolean;
  has_aal2: boolean;
};

export async function AdminTools() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.rpc("admin_access_context");
  const row = (Array.isArray(data) ? data[0] : data) as AdminContext | null;
  if (!row?.role || (row.require_mfa && !row.has_aal2)) return null;

  return (
    <nav className={styles.bar} aria-label="Admin tools">
      <span>REWEAR Admin</span>
      <Link href="/admin">Dashboard</Link>
      <Link href="/admin/operations">Operations</Link>
      <Link href="/admin/items">Items</Link>
      <Link href="/admin/resale-quality">Inspection &amp; pricing</Link>
      <Link href="/admin/support">Support</Link>
      <Link href="/admin/settings">Settings</Link>
    </nav>
  );
}
