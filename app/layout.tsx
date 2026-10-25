import { cookies } from "next/headers";
import { LanguageProvider, LanguageSwitch } from "@/components/site-language";
import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { PickupConfirmationUi } from "@/components/pickup-confirmation-ui";
import { ExperienceSwitch } from "@/components/experience-switch";
import { CartProvider } from "@/components/cart-store";
import { siteConfig } from "@/lib/site-config";
import { SupportFooter } from "@/components/support-footer";
import "./support.css";
import "./globals.css";
import "./additions.css";
import "./catalog.css";
import "./policy.css";
import "./pickup-policy.css";
import "./scheduling.css";
import "./form.css";
import "./shop.css";
import "./logistics.css";


import "./premium-theme.css";
import "./premium-components.css";
import "./premium-flows.css";
import "./premium-route-overrides.css";
import "./storefront.css";
import "./checkout-readiness.css";
import "./sellpy-theme.css";
import "./market-refresh.css";
import "./assistant.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const fr = (await cookies()).get("shikimomo-language")?.value === "fr";
  const title = fr ? "Shikimomo | Mode, électronique et décoration d’occasion" : "Shikimomo | Secondhand fashion, electronics & home decor";
  const description = fr ? "Achetez et vendez des vêtements, chaussures, appareils électroniques et articles pour la maison d’occasion avec collecte prise en charge et livraison au Canada." : "Sell and shop quality secondhand clothing, shoes, electronics and selected Home & Decor pieces with managed pickup and Canada-wide shopping.";
  return {
  metadataBase: new URL(siteConfig.siteUrl),
  ...(process.env.VERCEL_ENV === "preview" ? { robots: { index: false, follow: false } } : {}),
  title: {
    default: title,
    template: "%s | Shikimomo",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "Shikimomo",
    title,
    description,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg?v=shikimomo-2", type: "image/svg+xml" }, { url: "/brand/favicon-48.png", sizes: "48x48", type: "image/png" }],
    shortcut: "/favicon.svg?v=shikimomo-2",
    apple: [{ url: "/apple-touch-icon.png?v=shikimomo-2", sizes: "180x180", type: "image/png" }],
  },
};
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const sqlStaging = process.env.VERCEL_ENV === "preview" && process.env.SHIKIMOMO_NEON_STAGING === "true";
  const locale = (await cookies()).get("shikimomo-language")?.value === "fr" ? "fr" : "en";
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": new URL("/#organization", siteConfig.siteUrl).href,
    name: "Shikimomo",
    url: siteConfig.siteUrl,
    logo: new URL("/favicon.svg", siteConfig.siteUrl).href,
  };
  return (
    <html lang={locale} className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }} /><LanguageProvider initialLocale={locale}><LanguageSwitch /><CartProvider>{children}{!sqlStaging && <><SupportFooter /><PickupConfirmationUi /><ExperienceSwitch /></>}</CartProvider></LanguageProvider></body>
    </html>
  );
}
