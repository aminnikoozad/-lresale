import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminMfaClient } from "./mfa-client";
import "../../auth.css";

export const metadata: Metadata = {
  title: "Admin Verification | Rewear",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminMfaPage() {
  const { access } = await requireAdmin({ requireMfa: false });
  if (!access.require_mfa || access.has_aal2) redirect("/admin");

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">REWEAR<span>.</span></div>
        <p className="eyebrow dark">Owner / Admin security</p>
        <h1>Verify your identity</h1>
        <p>Privileged Admin access requires an authenticator-app code in addition to your password.</p>
        <AdminMfaClient />
      </section>
    </main>
  );
}
