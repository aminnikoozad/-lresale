"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/site-language";
export function ShippingOfferBanner() {
 const path=usePathname(); const fr=useLocale().locale==="fr";
 if (["/admin","/secure-admin-login","/staging","/account/seller/direct","/account/marketplace","/marketplace-rules","/closet/"].some(p=>path.startsWith(p))) return null;
 return <aside className="shipping-offer-banner" aria-label={fr?"Offre de livraison":"Shipping offer"} translate="no"><Link href="/shipping-policy#managed-shipping-offer">{fr?<>Livraison standard gratuite dès <strong>100 $ CA</strong> · Articles vendus par Shikimomo uniquement</>:<>Free standard shipping on <strong>CAD $100+</strong> · Sold by Shikimomo items only</>}</Link></aside>;
}
