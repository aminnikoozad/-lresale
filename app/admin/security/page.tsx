import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { changeAdminPassword, signOutAllAdminSessions } from "./actions";
import "../operations/operations.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminSecurityPage({ searchParams }: Props) {
  const { user, access } = await requireAdmin();
  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "error" ? "error" : "success";

  return (
    <main className="ops-shell">
      <header className="ops-top">
        <div><span className="brand">REWEAR<span>.</span></span><b>Admin</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/items">Items</Link>
          <Link href="/admin/operations">Operations</Link>
          <Link href="/admin/settings">Selling Rules</Link>
          <Link href="/admin/security">Security</Link>
        </nav>
      </header>

      <section className="ops-wrap">
        <div className="ops-heading">
          <div>
            <p className="eyebrow dark">Admin → Security</p>
            <h1>Owner security</h1>
            <p>Privileged access uses a private login URL, password, role authorization and mandatory authenticator-app MFA.</p>
          </div>
          <div className="security-chip">AAL2 verified · {access.role}</div>
        </div>

        {message ? <div className={`ops-message ${type}`}>{message}</div> : null}

        <section className="ops-card two-col">
          <div>
            <div className="ops-card-title"><div><h2>Admin identity</h2><p>Only an account present in the private admin role table can enter this area.</p></div></div>
            <div className="area-grid">
              <article><div><b>Email</b><span>{user.email}</span></div></article>
              <article><div><b>Role</b><span>{access.role}</span></div></article>
              <article><div><b>MFA</b><span>{access.require_mfa ? "Required" : "Optional"}</span></div></article>
              <article><div><b>Current assurance</b><span>{access.has_aal2 ? "AAL2 / verified" : "AAL1"}</span></div></article>
            </div>
          </div>

          <div>
            <div className="ops-card-title"><div><h2>Change Admin password</h2><p>Use a unique password with at least 14 characters. The password is handled by Supabase Auth and is never stored in application tables.</p></div></div>
            <form action={changeAdminPassword} className="settings-form">
              <label>Current password<input name="current_password" type="password" autoComplete="current-password" required /></label>
              <label>New password<input name="new_password" type="password" minLength={14} autoComplete="new-password" required /></label>
              <label>Confirm new password<input name="password_confirmation" type="password" minLength={14} autoComplete="new-password" required /></label>
              <button type="submit">Change password & sign out everywhere</button>
            </form>
          </div>
        </section>

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Session control</h2><p>If you lose a device or suspect access, invalidate all active Admin sessions immediately.</p></div></div>
          <form action={signOutAllAdminSessions}><button type="submit">Sign out all Admin sessions</button></form>
        </section>

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Security model now enforced</h2></div></div>
          <div className="area-grid">
            <article><div><b>No customer-facing Admin link</b><span>The private Admin sign-in path is not linked from the public marketplace.</span></div></article>
            <article><div><b>Server-side permissions</b><span>Database RPCs re-check Admin role and MFA before privileged writes.</span></div></article>
            <article><div><b>Audit trail</b><span>Pickup, service-area, reminder and shipping changes are logged.</span></div></article>
            <article><div><b>No raw passwords</b><span>Passwords stay inside Supabase Auth rather than application tables.</span></div></article>
          </div>
        </section>
      </section>
    </main>
  );
}
