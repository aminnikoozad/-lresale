import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { PickupConfirmationUi } from "@/components/pickup-confirmation-ui";
import { SupportChat } from "@/components/support-chat";
import { CartProvider } from "@/components/cart-store";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";
import "./additions.css";
import "./catalog.css";
import "./policy.css";
import "./pickup-policy.css";
import "./scheduling.css";
import "./form.css";
import "./shop.css";
import "./logistics.css";
import "./support-chat.css";
import "./support-chat-suggestions.css";
import "./premium-theme.css";
import "./premium-components.css";
import "./premium-flows.css";
import "./premium-route-overrides.css";
import "./storefront.css";
import "./checkout-readiness.css";
import "./sellpy-theme.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: "Rewear Market | Secondhand fashion, electronics & home decor",
    template: "%s | Rewear",
  },
  description: "Sell and shop quality secondhand clothing, shoes, electronics and selected Home & Decor pieces with managed pickup and Canada-wide shopping.",
  openGraph: {
    type: "website",
    siteName: "Rewear Market",
    title: "Rewear Market | Secondhand fashion, electronics & home decor",
    description: "Sell and shop quality secondhand clothing, shoes, electronics and selected Home & Decor pieces with managed pickup and Canada-wide shopping.",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body><CartProvider>{children}<PickupConfirmationUi /><SupportChat /></CartProvider></body>
    </html>
  );
}
