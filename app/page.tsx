import { connection } from "next/server";
import type { HomeData } from "@/lib/home-decor";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartNavLink } from "@/components/cart-store";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOG_CATEGORIES } from "@/lib/catalog-taxonomy";
import { loadPilotSettings, pilotAllowsCategory } from "@/lib/pilot-settings";
import { ShopCatalog, type CatalogCategory, type CatalogProduct } from "./shop-catalog";

export const dynamic = "force-dynamic";

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

  return (
    <main>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Rewear home">REWEAR<span>.</span></Link>
        <nav aria-label="Main navigation">
          <a href="#shop">Shop</a>
          {navCategories.map((entry) => <a key={entry.value} href={`#${entry.value}`}>{entry.label}</a>)}
          <Link href="/sell-with-rewear">How selling works</Link>
        </nav>
        <div className="header-actions"><CartNavLink /><Link href="/account" className="header-account-link">My account</Link><Button asChild className="header-sell-button"><Link href="/sell-with-rewear">Sell with us</Link></Button></div>
      </header>

      <section className="hero" aria-labelledby="home-hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">Managed secondhand, made effortless</p>
            <h1 id="home-hero-title">Great pieces deserve another life.</h1>
            <p>Shop inspected secondhand finds or let Rewear handle the work of reselling your items—from collection and photography to pricing and buyer messages.</p>
            <div className="hero-actions"><Button asChild size="lg"><a href="#shop">Shop now <ArrowRight /></a></Button><Button asChild size="lg" variant="outline"><Link href="/sell-with-rewear">Sell your items</Link></Button></div>
            <div className="hero-trust" aria-label="Rewear service highlights"><span>Inspected listings</span><span>Managed resale</span><span>Canada-wide shopping</span></div>
          </div>
          <div className="hero-media" aria-hidden="true"><Image src="/fashion-hero.webp" alt="" fill priority sizes="(max-width: 900px) 100vw, 55vw" /></div>
        </div>
      </section>

      <section className="shipping-strip" aria-label="Canada delivery policy"><Truck /><div><strong>{shipping.canadaWideEnabled === false ? "Delivery policy" : "Shop from anywhere in Canada."}</strong><span>{shippingSummary}</span></div><Link href="/shipping-policy">Delivery details</Link></section>

      <ShopCatalog products={catalogProducts} now={requestTime} activeCategories={activeCategories} />

      <section id="sell" className="process-section">
        <div className="process-intro"><p className="eyebrow">The effortless way to resell</p><h2>We pick it up.<br />You’re done.</h2><p>From your door to the buyer, our team handles every step. Fees, acceptance rules and your commission are visible before you commit.</p><Button asChild variant="secondary"><Link href="/sell-with-rewear">See the seller guide</Link></Button></div>
        <ol className="steps"><li><b>01</b><div><h3>Tell us you’re ready</h3><p>Choose a REWEAR Bag or use your own bag/box, review the fees and request an available collection window.</p></div></li><li><b>02</b><div><h3>We collect and prepare everything</h3><p>Our team receives, identifies, inspects, photographs, prices and lists accepted items in the categories currently enabled by Rewear.</p></div></li><li><b>03</b><div><h3>We sell. You earn.</h3><p>We handle buyers and the sale. Your item progress, batch counts, commission and seller earnings stay visible in your account.</p></div></li></ol>
      </section>

      <section className="guarantee-section"><div><ShieldCheck /><p className="eyebrow">Company-managed shopping</p><h2>Listings are prepared and reviewed by Rewear.</h2><p>{pilot.enabled ? "During the pilot, only the categories enabled in Pilot Settings are accepted and published." : "Rewear reviews accepted items before publication."} If an item does not match its listing, contact Support and we’ll review the case under the current approved policy.</p><Button asChild variant="secondary"><a href="#shop">Browse items</a></Button></div></section>

      <footer><div className="brand">REWEAR<span>.</span></div><p>{pilot.enabled ? `${navCategories.map((entry) => entry.label).join(" · ")} pilot` : "Women · Men · Kids · Shoes · Accessories · Electronics · Home & Decor"}</p><div className="footer-links"><Link href="/sell-with-rewear">Seller guide</Link><Link href="/pickup-policy">Pickup policy</Link><Link href="/shipping-policy">Shipping policy</Link><Link href="/account">Customer account</Link></div></footer>
    </main>
  );
}
