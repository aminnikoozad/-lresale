import type { Metadata } from "next";
import { PickupTierUi } from "@/components/pickup-tier-ui";
import "./globals.css";
import "./additions.css";
import "./catalog.css";
import "./policy.css";
import "./pickup-policy.css";
import "./scheduling.css";
import "./form.css";
import "./shop.css";
export const metadata: Metadata = {title:"Rewear Market | Secondhand fashion, handled",description:"Sell and shop quality secondhand clothing for women, men and kids, plus electronics.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}<PickupTierUi /></body></html>}
