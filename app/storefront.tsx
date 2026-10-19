
import { Localize } from "@/components/site-language";
import { BrandWordmark } from "@/components/brand-wordmark";


import { connection } from "next/server";
import type { HomeData } from "@/lib/home-decor";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck, UserRound, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartNavLink } from "@/components/cart-store";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOG_CATEGORIES } from "@/lib/catalog-taxonomy";
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
  const [{ data, error }, { data: shippingData, error: shippingError }, { data: homeData, error: homeError }, pilot] = await Promise.all([
    supabase.rpc("catalog_items_v3"),
    supabase.rpc("get_shipping_policy"),
    supabase.rpc("home_catalog_details"),
    loadPilotSettings(supabase),
  ]);

  if (error) console.error("[home] catalog load failed", { code: error.code, message: error.message });
  if (shippingError) console.error("[home] shipping policy load failed", { code: shippingError.code, message: shippingError.message });
  if (homeError) console.error("[home] Home details unavailable", { code: homeError.code });

  const homeMap = new Map(((homeData ?? []) as { item_id: string; details: HomeData; price_drop: boolean }[]).map((h) => [h.item_id, h]));
  const shipping = (shippingData ?? {}) as ShippingPolicy;
  const localRadius = Number(shipping.localFreeRadiusKm);
  const localCenter = shipping.localCenterName || "Montréal";
  const shippingSummary = Number.isFinite(localRadius) && localRadius > 0
    ? `Free local delivery in ${localCenter} and within the configured ${localRadius} km local radius when the delivery address is eligible. Shipping fees apply outside the local area.`
    : "Local delivery eligibility is confirmed from the delivery address. Shipping fees may apply outside the local area.";

  const activeCategories = pilot.enabled ? pilot.categories : CATALOG_CATEGORIES.map((entry) => entry.value);
  const catalogProducts: CatalogProduct[] = ((data ?? []) as CatalogRow[])
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
          <Button asChild className="header-sell-button"><Link href="/sell-with-shikimomo">Sell with Shikimomo</Link></Button>
        </div>
      </header>

      <nav className="market-category-nav" aria-label="Shop departments">
        <a href="#shop">All finds</a>
        {navCategories.map((entry) => <a key={entry.value} href={`#${entry.value}`}>{entry.label}</a>)}
        <Link href="/sell-with-shikimomo" className="market-how-link">How it works <ArrowRight aria-hidden="true" /></Link>
        <Link href="/support">Contact &amp; support</Link>
      </nav>

      <section className="hero" aria-labelledby="home-hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <h1 id="home-hero-title">Find your next<br />favourite piece.</h1>
            <p>Find clothing by size, condition and price. See the details of each piece before adding it to your bag.</p>
            <div className="hero-actions">
              <Button asChild size="lg"><a href="#shop">Explore the shop <ArrowRight aria-hidden="true" /></a></Button>
            </div>
          </div>
          <div className="hero-media">
            <Image src="/fashion-hero.webp" alt="An editorial clothing rail with folded knitwear and denim" fill priority sizes="(max-width: 900px) 100vw, 52vw" />
          </div>
        </div>
      </section>

      <div className="market-service-strip" aria-label="How Shikimomo is different">
        <span><ShieldCheck aria-hidden="true" /><span><strong>Checked before listing</strong>Real pieces. Accountable inspection.</span></span>
        <span><PackageCheck aria-hidden="true" /><span><strong>Details before you decide</strong>Size, colour, condition and price.</span></span>
        <span><PackageCheck aria-hidden="true" /><span><strong>Know where you stand</strong>Shipping and policies before payment.</span></span>
      </div>

      <ShopCatalog products={catalogProducts} now={requestTime} activeCategories={activeCategories} loadError={Boolean(error)} />

      <section className="shipping-strip" aria-label="Canada delivery policy"><Truck aria-hidden="true" /><div><strong>{shipping.canadaWideEnabled === false ? "Delivery, with the details up front." : "Finds worth sending across Canada."}</strong><span>{shippingSummary}</span></div><Link href="/shipping-policy">Delivery details <ArrowRight aria-hidden="true" /></Link></section>

      <section className="guarantee-section"><div><ShieldCheck /><p className="eyebrow">Company-managed shopping</p><h2>Listings are prepared and reviewed by Shikimomo.</h2><p>{pilot.enabled ? "During the pilot, only the categories enabled in Pilot Settings are accepted and published." : "Shikimomo reviews accepted items before publication."} If an item does not match its listing, contact Support and we’ll review the case under the current approved policy.</p><Button asChild variant="secondary"><a href="#shop">Browse items</a></Button></div></section>

      <footer>
        <div className="brand"><BrandWordmark /></div>
        <p>{pilot.enabled ? `${navCategories.map((entry) => entry.label).join(" · ")} pilot` : "Women · Men · Kids · Shoes · Accessories · Electronics · Home & Decor"}</p>
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

