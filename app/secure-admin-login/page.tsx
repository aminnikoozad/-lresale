import type { Metadata } from "next";
import { adminLogin } from "./actions";
import "../auth.css";

export const metadata: Metadata = {
  title: "Restricted Access",
  robots: { index: false, follow: false, nocache: true },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SecureAdminLogin({ searchParams }: Props) {
  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">REWEAR<span>.</span></div>
        <p className="eyebrow dark">Restricted staff access</p>
        <h1>Admin sign in</h1>
        <p>This page is for authorized Rewear administrators only.</p>
        {message ? <div className="auth-message error">{message}</div> : null}
        <form className="auth-form" action={adminLogin}>
          <label htmlFor="admin-email">Admin email
            <input id="admin-email" name="email" type="email" autoComplete="username" required />
          </label>
          <label htmlFor="admin-password">Password
            <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="auth-submit" type="submit">Continue securely</button>
        </form>
        <small>Authorized accounts must complete multi-factor authentication before privileged actions are allowed.</small>
      </section>
    </main>
  );
}
