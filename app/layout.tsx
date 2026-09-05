import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { PickupTierUi } from "@/components/pickup-tier-ui";
import { PickupConfirmationUi } from "@/components/pickup-confirmation-ui";
import { SupportChat } from "@/components/support-chat";
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
import "./premium-theme.css";
import "./premium-components.css";
import "./premium-flows.css";
import "./premium-route-overrides.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "Rewear Market | Secondhand fashion, shoes & electronics",
  description: "Sell and shop quality secondhand clothing, shoes and electronics with managed pickup and Canada-wide shopping.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <body>{children}<PickupTierUi /><PickupConfirmationUi /><SupportChat /></body>
    </html>
  );
}
