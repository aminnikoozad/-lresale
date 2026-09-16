import Link from "next/link";
import styles from "./admin-tools.module.css";

export function AdminTools() {
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
