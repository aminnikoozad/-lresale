import Link from "next/link";
import { CheckCircle2, CircleAlert, ExternalLink, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";
import { postalReadiness } from "@/lib/postal-server";
import { publicLaunchReadiness, siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

function envSet(name: string) {
  return Boolean(process.env[name]?.trim());
}

type Check = {
  label: string;
  ok: boolean;
  detail: string;
  manual?: boolean;
};

export default async function AdminReadinessPage() {
  const { supabase, access } = await requireAdmin();
  const carrier = postalReadiness();
  const postalState = access.can_manage_shipping && access.has_aal2
    ? await supabase.rpc("admin_postal_state")
    : null;
  const postalConfig = postalState && !postalState.error
    ? (postalState.data as { config?: { enabled?: boolean; origin_postal?: string } } | null)?.config
    : null;
  const publicConfig = publicLaunchReadiness();
  const checks: Check[] = [
    {
      label: "Public site URL",
      ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim()),
      detail: `Current public origin: ${siteConfig.siteUrl}`,
    },
    {
      label: "Business support contact",
      ok: Boolean(siteConfig.supportEmail && siteConfig.businessAddress && siteConfig.businessPhone),
      detail: "Support email, business address and business phone must be published before paid orders are enabled.",
    },
    {
      label: "Privacy contact",
      ok: Boolean(siteConfig.privacyEmail),
      detail: "A privacy contact must be published in the Privacy Policy.",
    },
    {
      label: "Turnstile site key",
      ok: envSet("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
      detail: "Browser-side CAPTCHA site key for public authentication forms.",
    },
    {
      label: "Supabase Auth CAPTCHA provider",
      ok: false,
      manual: true,
      detail: "Verify Cloudflare Turnstile is enabled in Supabase Auth and its secret key is configured there. The app forwards the CAPTCHA token to Supabase Auth for server-side verification.",
    },
    {
      label: "Supabase Auth email delivery",
      ok: false,
      manual: true,
      detail: "Verify the email provider/SMTP configuration in Supabase Auth and test signup confirmation and password recovery end to end. A Vercel RESEND_API_KEY is not used by these auth flows and does not establish delivery readiness. Verify any transactional email flow separately before advertising it.",
    },
    {
      label: "Checkout reservation cleanup",
      ok: (process.env.CRON_SECRET?.length ?? 0) >= 32 && (envSet("SUPABASE_SECRET_KEY") || envSet("SUPABASE_SERVICE_ROLE_KEY")),
      detail: "Set a 32+ character CRON_SECRET and the server-only Supabase service key. The daily production job expires prepared orders; verify its first run in deployment logs.",
    },
    {
      label: "Production database migrations",
      ok: false,
      manual: true,
      detail: "Apply pending Supabase migrations in order and verify checkout, cancellation, cleanup, staff fulfilment and return-review RPCs against the production project.",
    },
    {
      label: "Canada Post production configuration",
      ok: carrier.carrier && carrier.production && carrier.storage && Boolean(postalConfig?.enabled && postalConfig.origin_postal),
      detail: "Production carrier credentials, secure quote storage, and an enabled origin in Postal Shipping are required. Credential presence does not prove a live rate works.",
    },
    {
      label: "Supabase Edge Function AI support",
      ok: false,
      manual: true,
      detail: "If AI support is advertised, verify the deployed support-ai Edge Function, its OPENAI_API_KEY in Supabase, and a successful support response. A Vercel environment variable cannot verify Edge Function configuration. AI support is not required to prepare checkout.",
    },
    {
      label: "Supabase leaked-password protection",
      ok: false,
      manual: true,
      detail: "Verify the current leaked-password protection setting in Supabase Auth and review the latest Security Advisor report. This page does not query the live setting.",
    },
    {
      label: "GST/QST and tax configuration",
      ok: false,
      manual: true,
      detail: "Confirm the business registration/tax status with the appropriate tax professional or authority, then configure server-side tax calculation before charging customers. Do not infer tax collection from the checkout UI.",
    },
    {
      label: "Seller settlement and refund procedure",
      ok: false,
      manual: true,
      detail: "Confirm return windows, payout holds, reconciliation and who authorizes refunds. Seller wallet credits stay pending; review approval alone never refunds a customer.",
    },
    {
      label: "French customer journey",
      ok: false,
      manual: true,
      detail: "Manual launch review required: storefront, account, checkout, policies and post-purchase communications must have a complete French customer path for Quebec launch.",
    },
    {
      label: "Payment provider",
      ok: false,
      manual: true,
      detail: "Intentionally disabled. Connect only after every pre-payment blocker above is green and sandbox webhook tests pass.",
    },
  ];

  const automaticReady = publicConfig.ready && checks.filter((check) => !check.manual).every((check) => check.ok);

  return (
    <main className="admin-page-shell">
      <div className="admin-page-header">
        <div>
          <p className="eyebrow dark">Launch control</p>
          <h1>Pre-payment readiness</h1>
          <p>Configuration status only. Secret values are never shown on this page.</p>
        </div>
        <Link href="/admin"><ShieldCheck /> Admin home</Link>
      </div>

      <section className="admin-panel">
        <h2>{automaticReady ? "Automatic checks are ready" : "Payment must remain disabled"}</h2>
        <p>{automaticReady ? "Configuration checks passed. Complete the manual checks before adding a live payment provider." : "One or more required launch settings are still missing or require manual verification."}</p>
        {!access.can_manage_shipping ? <p>Shipping configuration can be verified by an admin with shipping permission and MFA in <Link href="/admin/postal">Postal Shipping</Link>.</p> : null}
        <div className="admin-readiness-list">
          {checks.map((check) => (
            <div key={check.label} className="admin-readiness-row">
              {check.ok ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
              <div><strong>{check.label}</strong><p>{check.detail}</p>{check.manual ? <small>Manual check</small> : null}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <h2>Mandatory payment sandbox tests</h2>
        <ul>
          <li>Successful payment and duplicate-webhook idempotency.</li>
          <li>Failed, cancelled and expired payment sessions release inventory reservations.</li>
          <li>Server-calculated amount, tax and shipping match the provider charge.</li>
          <li>The exact buyer terms, return policy and privacy-notice versions accepted for the order are persisted before payment.</li>
          <li>Refunds reverse order state and seller accounting exactly once.</li>
          <li>Disputes/chargebacks cannot create a second seller credit or leave refunded inventory/accounting inconsistent.</li>
          <li>Webhook signatures are verified before any order or wallet mutation.</li>
          <li>No card data, provider secrets or full payment payloads are logged.</li>
        </ul>
        <p><ExternalLink /> Do not add live provider keys until these tests exist and pass.</p>
      </section>
    </main>
  );
}
