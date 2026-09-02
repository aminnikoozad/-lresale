import type { Metadata } from "next";
import "./globals.css";
import "./additions.css";
import "./catalog.css";
import "./policy.css";
import "./form.css";
import "./shop.css";
export const metadata: Metadata = {title:"Rewear Market | Secondhand fashion, handled",description:"Sell and shop quality secondhand clothing for women, men and kids, plus fragrance.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
