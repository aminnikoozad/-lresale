import "./local-service-banner.css";
import { CATALOG_CATEGORIES } from "@/lib/catalog-taxonomy";

import { Localize } from "@/components/site-language";
import { BrandWordmark } from "@/components/brand-wordmark";
import type { SaleProvenance } from "@/components/sale-provenance-badge";


import { connection } from "next/server";
import type { HomeData } from "@/lib/home-decor";
import { SellingHero } from "@/components/selling-hero";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck, UserRound, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartNavLink } from "@/components/cart-store";
import { createPublicClient } from "@/lib/supabase/public";
import { loadPilotSettings, pilotAllowsCategory } from "@/lib/pilot-settings";
import { ShopCatalog, type CatalogCategory, type CatalogProduct } from "./shop-catalog";



const allowedCategories = new Set<CatalogCategory>(["women", "men", "kids", "shoes", "accessories", "electronics", "home_decor"]);

type CatalogRow = {
  item_id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string | null;
  size: string | null;
  item_condition: string | null;
  color: string | null;
  material: string | null;
  pattern: string | null;
  photo_url: string | null;
  price_cents: number;
  published_at: string | null;
  photo_urls?:string[];
  sale_mode?:"managed_consignment"|"peer_to_peer";
};

type ShippingPolicy = {
  canadaWideEnabled?: boolean;
  localCenterName?: string;
  localFreeRadiusKm?: number | string;
};

export default async function Home() {
  await connection();
  const requestTime = new Date().getTime();
  const supabase = createPublicClient();
  const [{ data, error }, { data: shippingData, error: shippingError }, { data: homeData, error: homeError }, pilot, { data: sellingData, error: sellingError }, direct] = await Promise.all([
    supabase.rpc("catalog_items_v3"),
    supabase.rpc("get_shipping_policy"),
    supabase.rpc("home_catalog_details"),
    loadPilotSettings(supabase),
    supabase.rpc("get_public_selling_rules"),
    supabase.rpc("direct_catalog"),
  ]);

  if (error) console.error("[home] catalog load failed", { code: error.code, message: error.message });
  if (shippingError) console.error("[home] shipping policy load failed", { code: shippingError.code, message: shippingError.message });
  if (homeError) console.error("[home] Home details unavailable", { code: homeError.code });

  const homeMap = new Map(((homeData ?? []) as { item_id: string; details: HomeData; price_drop: boolean }[]).map((h) => [h.item_id, h]));
  const shipping = (shippingData ?? {}) as ShippingPolicy;
  const localRadius = Number(shipping.localFreeRadiusKm);
  const localCenter = shipping.localCenterName || "Montréal";
  const shippingSummary = Number.isFinite(localRadius) && localRadius > 0
    ? `Free delivery in ${localCenter} and within ${localRadius} km. Shipping fees apply elsewhere in Canada.`
    : "Enter your address to check local delivery. Shipping fees may apply elsewhere.";

  // Only advertise rates returned by the public policies; do not promise free
  // services from fallback defaults when settings could not be loaded.
  const pickupPolicy = sellingData?.pickupRules;
  const pickupThreshold = pickupPolicy?.freePickupThresholdCents;
  const collectionFee = pickupPolicy?.processingFeeCents;
  const showLocalDelivery = !shippingError && Number.isFinite(localRadius) && localRadius > 0;
  const showFreePickup = !sellingError && Number.isSafeInteger(pickupThreshold) && pickupThreshold >= 0
    && Number.isSafeInteger(collectionFee) && collectionFee >= 0;
  const cad = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

  const activeCategories = pilot.enabled ? pilot.categories : CATALOG_CATEGORIES.map((entry) => entry.value);
  const directRows:CatalogRow[]=Array.isArray(direct.data)?direct.data.map(row=>({...row,photo_url:row.photo_urls?.[0]})):[];
  const catalogProducts: CatalogProduct[] = ([...(data ?? []),...directRows] as CatalogRow[])
    .filter((row) =>
      typeof row.item_id === "string" &&
      typeof row.name === "string" &&
      typeof row.brand === "string" &&
      allowedCategories.has(row.category as CatalogCategory) &&
      pilotAllowsCategory(row.category, pilot) &&
      typeof row.photo_url === "string" &&
      row.photo_url.length > 0 &&
      Number.isInteger(row.price_cents) &&
      row.price_cents > 0,
    )
    .slice(0, pilot.enabled && pilot.itemCap !== null ? pilot.itemCap : undefined)
    .map((row) => ({
      id: row.item_id,
      name: row.name,
      brand: row.brand,
      priceCents: row.price_cents,
      category: row.category as CatalogCategory,
      subcategory: row.subcategory,
      condition: row.item_condition,
      size: row.size,
      color: row.color,
      material: row.material,
      pattern: row.pattern,
      photoUrl: row.photo_url!,
      publishedAt: row.published_at,
      ...(row.sale_mode==="peer_to_peer"?{provenance:{sale_mode:"peer_to_peer",physical_custody:"seller",shipping_responsibility:"seller",team_inspected:false} as SaleProvenance}:{}),
      home: homeMap.get(row.item_id)?.details,
      priceDrop: homeMap.get(row.item_id)?.price_drop ?? false,
    }));





  const navCategories = CATALOG_CATEGORIES.filter((entry) => activeCategories.includes(entry.value));

  return <Localize>{(
    <main className="market-home">
      <a className="market-skip-link" href="#shop">Skip to the shop</a>
      <header className="site-header market-header market-header-single-brand" style={{ display: "flex", justifyContent: "flex-end" }}>

        <div className="header-actions">
          <Link href="/account" className="market-account-link"><UserRound aria-hidden="true" /><span>Account</span></Link>
          <CartNavLink />
        </div>
      </header>



      {(showLocalDelivery || showFreePickup) && <aside className="local-service-banner" aria-label="Local delivery and pickup">
        <p className="local-service-banner-heading">{`${localCenter}, we come to you.`}</p>
        <div className="local-service-banner-options">
          {showLocalDelivery && <Link href="/shipping-policy"><Truck aria-hidden="true"/><span><strong>Free local delivery</strong><span>{`In ${localCenter} and within ${localRadius} km.`}</span><small>Shipping fees apply elsewhere in Canada.</small></span><ArrowRight aria-hidden="true"/></Link>}
          {showFreePickup && <Link href="/pickup-policy"><PackageCheck aria-hidden="true"/><span><strong>Free clothing pickup</strong><span>{`For collections with an estimated resale value of ${cad(pickupThreshold)} or more.`}</span>{collectionFee > 0 && <small>{`Service fee: ${cad(collectionFee)} per collection. Offers may apply.`}</small>}</span><ArrowRight aria-hidden="true"/></Link>}
        </div>
      </aside>}

      <SellingHero />

      <div className="market-service-strip" aria-label="How Shikimomo is different">
        <span><ShieldCheck aria-hidden="true" /><span><strong>Checked before listing</strong>Every piece checked by our team.</span></span>
        <span><PackageCheck aria-hidden="true" /><span><strong>Details before you decide</strong>Size, colour, condition and price.</span></span>
        <span><PackageCheck aria-hidden="true" /><span><strong>Know where you stand</strong>Delivery and return details up front.</span></span>
      </div>

      <ShopCatalog products={catalogProducts} now={requestTime} activeCategories={activeCategories} loadError={Boolean(error)} />

      <section className="shipping-strip" aria-label="Canada delivery policy"><Truck aria-hidden="true" /><div><strong>{shipping.canadaWideEnabled === false ? "Delivery, with the details up front." : "Finds worth sending across Canada."}</strong><span>{shippingSummary}</span></div><Link href="/shipping-policy">Delivery details <ArrowRight aria-hidden="true" /></Link></section>

      <section className="guarantee-section"><div><ShieldCheck /><p className="eyebrow">Checked by our team</p><h2>We inspect and photograph every item.</h2><p>{pilot.enabled ? "For now, we accept women’s, men’s and kids’ clothing." : "We check each item before listing it."} If an item doesn’t match its listing, contact Support. We’ll look into it.</p><Button asChild variant="secondary"><a href="#shop">Browse items</a></Button></div></section>

      <footer>
        <div className="brand"><BrandWordmark /></div>
        <p>{pilot.enabled ? `${navCategories.map((entry) => entry.label).join(" · ")} collections` : "Women · Men · Kids · Shoes · Accessories · Electronics · Home & Decor"}</p>
        <div className="footer-links">
          <Link href="/support">Contact &amp; support</Link>
          <Link href="/sell-with-shikimomo">Seller guide</Link>
          <Link href="/seller-terms">Seller terms</Link>
          <Link href="/pickup-policy">Pickup policy</Link>
          <Link href="/shipping-policy">Shipping policy</Link>
          <Link href="/returns">Returns & refunds</Link>
          <Link href="/account/preferences">New arrivals by email</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/account">Customer account</Link>
        </div>
      </footer>
    </main>
  )}</Localize>;
}

