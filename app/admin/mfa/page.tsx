
import { Localize } from "@/components/site-language";
import { BrandWordmark } from "@/components/brand-wordmark";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminMfaClient } from "./mfa-client";
import "../../auth.css";

export const metadata: Metadata = {
  title: "Admin Verification | Shikimomo",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminMfaPage() {
  const { access } = await requireAdmin({ requireMfa: false });
  if (access.has_aal2) redirect("/admin");

  return <Localize>{(
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand"><BrandWordmark /></div>
        <p className="eyebrow dark">Owner / Admin security</p>
        <h1>Verify your identity</h1>
        <p>Privileged Admin access requires an authenticator-app code in addition to your password.</p>
        <AdminMfaClient />
      </section>
    </main>
  )}</Localize>;
}
