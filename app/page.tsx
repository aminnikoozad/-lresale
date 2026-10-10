import { connection } from "next/server";
import type { HomeData } from "@/lib/home-decor";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgePercent, Search, ShieldCheck, Truck, UserRound, PackageCheck, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartNavLink } from "@/components/cart-store";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOG_CATEGORIES } from "@/lib/catalog-taxonomy";
import { formatCadFromCents } from "@/lib/business-rules";
import { loadLaunchSellerOffer } from "@/lib/launch-offer";
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
  const [{ data, error }, { data: shippingData, error: shippingError }, { data: homeData, error: homeError }, pilot, launchOffer] = await Promise.all([
    supabase.rpc("catalog_items_v3"),
    supabase.rpc("get_shipping_policy"),
    supabase.rpc("home_catalog_details"),
    loadPilotSettings(supabase),
    loadLaunchSellerOffer(supabase),
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
  const waivedServiceFee = formatCadFromCents(launchOffer.waivedServiceFeeCents);

  const departmentNotes: Record<string, string> = {
    women: "Tops, dresses, denim and more.",
    men: "Shirts, knitwear, denim and more.",
    kids: "Everyday clothing for growing kids.",
  };

  return (
    <main className="market-home">
      <a className="market-skip-link" href="#shop">Skip to the shop</a>
      <div className="market-announcement">REWEAR · Managed secondhand in Montréal</div>
      <header className="site-header market-header">
        <Link href="/" className="brand" aria-label="REWEAR home">REWEAR<span>.</span></Link>
        <form className="market-header-search" action="/#shop" method="get" role="search">
          <Search aria-hidden="true" />
          <input type="search" name="q" aria-label="Search the REWEAR catalog" placeholder="Search brands or pieces" />
          <button type="submit" aria-label="Search catalog"><ArrowRight aria-hidden="true" /></button>
        </form>
        <div className="header-actions">
          <Link href="/account" className="market-account-link"><UserRound aria-hidden="true" /><span>Account</span></Link>
          <CartNavLink />
          <Button asChild className="header-sell-button"><Link href="/sell-with-rewear">Sell with REWEAR</Link></Button>
        </div>
      </header>

      <nav className="market-category-nav" aria-label="Shop departments">
        <a href="#shop">All finds</a>
        {navCategories.map((entry) => <a key={entry.value} href={`#${entry.value}`}>{entry.label}</a>)}
        <Link href="/sell-with-rewear" className="market-how-link">How it works <ArrowRight aria-hidden="true" /></Link>
      </nav>

      {launchOffer.active ? (
        <section className="shipping-strip" aria-label="Launch seller offer">
          <BadgePercent />
          <div>
            <strong>Launch offer: first {launchOffer.maxClaims} sellers get the {waivedServiceFee} batch service fee waived on their first collection.</strong>
            <span>{launchOffer.remaining} spots remain. Creating an account does not reserve a spot; the offer is claimed only when a first collection request is successfully submitted. The flat $5 pickup fee still applies when the pickup value is below $100.</span>
          </div>
          <Link href="/sell-with-rewear#launch-offer">Offer details</Link>
        </section>
      ) : null}

      <section className="hero" aria-labelledby="home-hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <h1 id="home-hero-title">Secondhand,<br />made simple.</h1>
            <p>Shop inspected clothing, or send us the pieces you no longer wear. We handle preparation, photography and resale.</p>
            <div className="hero-actions">
              <Button asChild size="lg"><a href="#shop">Explore the shop <ArrowRight aria-hidden="true" /></a></Button>
              <Button asChild size="lg" variant="outline"><Link href="/sell-with-rewear">Sell your pieces</Link></Button>
            </div>
          </div>
          <div className="hero-media">
            <Image src="/fashion-hero.webp" alt="An editorial clothing rail with folded knitwear and denim" fill priority sizes="(max-width: 900px) 100vw, 52vw" />
          </div>
        </div>
      </section>

      <div className="market-service-strip" aria-label="How REWEAR is different">
        <span><ShieldCheck aria-hidden="true" /><span><strong>Checked before listing</strong>Real pieces. Accountable inspection.</span></span>
        <span><Camera aria-hidden="true" /><span><strong>We do the resale work</strong>Preparation, photography and listing.</span></span>
        <span><PackageCheck aria-hidden="true" /><span><strong>Know where you stand</strong>Clear condition, prices and seller terms.</span></span>
      </div>

      <section className="market-discover" aria-labelledby="market-discover-title">
        <div className="market-discover-heading"><div><h2 id="market-discover-title">Shop by department.</h2></div><a href="#shop">Explore all finds <ArrowRight aria-hidden="true" /></a></div>
        <div className="market-discover-grid">
          {navCategories.map((entry) => <a className={`market-discover-card department-${entry.value}`} href={`#${entry.value}`} key={entry.value}>
            <span className="market-discover-label">{entry.label}<ArrowRight aria-hidden="true" /></span>
            <span className="market-discover-description">{departmentNotes[entry.value] ?? "Explore available items."}</span>
            <span className="market-discover-count">{error ? "Explore department" : `${catalogProducts.filter((product) => product.category === entry.value).length} pieces available`}</span>
          </a>)}
        </div>
      </section>

      <ShopCatalog products={catalogProducts} now={requestTime} activeCategories={activeCategories} loadError={Boolean(error)} />

      <section className="shipping-strip" aria-label="Canada delivery policy"><Truck aria-hidden="true" /><div><strong>{shipping.canadaWideEnabled === false ? "Delivery, with the details up front." : "Finds worth sending across Canada."}</strong><span>{shippingSummary}</span></div><Link href="/shipping-policy">Delivery details <ArrowRight aria-hidden="true" /></Link></section>

      <section id="sell" className="process-section">
        <div className="process-intro"><p className="eyebrow">Selling with REWEAR</p><h2>You send it.<br />We handle the rest.</h2><p>For the pieces you no longer reach for: check the acceptance rules and fees up front. Our team takes over after collection and decides what can be listed following physical inspection.</p><Button asChild variant="secondary"><Link href="/sell-with-rewear">See the seller guide</Link></Button></div>
        <ol className="steps"><li><b>01</b><div><h3>Prepare your collection</h3><p>Check the $8 individual item minimum and $60 estimated Bag minimum, then request an available pickup window.</p></div></li><li><b>02</b><div><h3>We collect and prepare everything</h3><p>Our team receives, identifies, inspects, photographs, prices and lists accepted items in the categories currently enabled by Rewear.</p></div></li><li><b>03</b><div><h3>Follow every step.</h3><p>We handle buyers and the sale. Your item progress, batch counts, commission and seller earnings stay visible in your account.</p></div></li></ol>
      </section>

      <section className="guarantee-section"><div><ShieldCheck /><p className="eyebrow">Company-managed shopping</p><h2>Listings are prepared and reviewed by Rewear.</h2><p>{pilot.enabled ? "During the pilot, only the categories enabled in Pilot Settings are accepted and published." : "Rewear reviews accepted items before publication."} If an item does not match its listing, contact Support and we’ll review the case under the current approved policy.</p><Button asChild variant="secondary"><a href="#shop">Browse items</a></Button></div></section>

      <footer>
        <div className="brand">REWEAR<span>.</span></div>
        <p>{pilot.enabled ? `${navCategories.map((entry) => entry.label).join(" · ")} pilot` : "Women · Men · Kids · Shoes · Accessories · Electronics · Home & Decor"}</p>
        <div className="footer-links">
          <Link href="/sell-with-rewear">Seller guide</Link>
          <Link href="/seller-terms">Seller terms</Link>
          <Link href="/pickup-policy">Pickup policy</Link>
          <Link href="/shipping-policy">Shipping policy</Link>
          <Link href="/returns">Returns & refunds</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/account">Customer account</Link>
        </div>
      </footer>
    </main>
  );
}
