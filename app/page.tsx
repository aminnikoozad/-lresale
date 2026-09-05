import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommissionSection } from "@/components/commission-section";
import { createClient } from "@/lib/supabase/server";
import { ShopCatalog, type CatalogCategory, type CatalogProduct } from "./shop-catalog";

export const dynamic = "force-dynamic";

const brands = [
  "Aritzia",
  "COS",
  "Zara",
  "Nike",
  "Adidas",
  "Levi’s",
  "Lululemon",
  "Ralph Lauren",
  "The North Face",
  "H&M",
  "Mango",
  "Coach",
];

const allowedCategories = new Set<CatalogCategory>([
  "women",
  "men",
  "kids",
  "shoes",
  "accessories",
  "electronics",
]);

type CatalogRow = {
  item_id: string;
  name: string;
  brand: string;
  category: string;
  size: string | null;
  item_condition: string | null;
  photo_url: string | null;
  price_cents: number;
};

type ShippingPolicy = {
  canadaWideEnabled?: boolean;
  localCenterName?: string;
  localFreeRadiusKm?: number | string;
  nonlocalFeeMode?: string;
  nonlocalFlatFeeCents?: number | null;
};

export default async function Home() {
  const supabase = await createClient();
  const [{ data, error }, { data: shippingData, error: shippingError }] = await Promise.all([
    supabase.rpc("catalog_items"),
    supabase.rpc("get_shipping_policy"),
  ]);

  if (error) {
    console.error("[home] catalog load failed", { code: error.code, message: error.message });
  }
  if (shippingError) {
    console.error("[home] shipping policy load failed", { code: shippingError.code, message: shippingError.message });
  }

  const shipping = (shippingData ?? {}) as ShippingPolicy;
  const localRadius = Number(shipping.localFreeRadiusKm);
  const localCenter = shipping.localCenterName || "Montréal";
  const shippingSummary = Number.isFinite(localRadius) && localRadius > 0
    ? `Free local delivery in ${localCenter} and within the configured ${localRadius} km local radius when the delivery address is eligible. Shipping fees apply outside the local area.`
    : "Local delivery eligibility is confirmed from the delivery address. Shipping fees may apply outside the local area.";

  const catalogProducts: CatalogProduct[] = ((data ?? []) as CatalogRow[])
    .filter((row) =>
      typeof row.item_id === "string" &&
      typeof row.name === "string" &&
      typeof row.brand === "string" &&
      allowedCategories.has(row.category as CatalogCategory) &&
      typeof row.photo_url === "string" &&
      row.photo_url.length > 0 &&
      Number.isInteger(row.price_cents) &&
      row.price_cents > 0,
    )
    .map((row) => ({
      id: row.item_id,
      name: row.name,
      brand: row.brand,
      priceCents: row.price_cents,
      category: row.category as CatalogCategory,
      condition: row.item_condition,
      size: row.size,
      photoUrl: row.photo_url!,
    }));

  return (
    <main>
      <header className="site-header">
        <Link href="/" className="brand">
          REWEAR<span>.</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#shop">Shop</a>
          <a href="#shop">Shoes</a>
          <a href="#sell">Sell with us</a>
          <a href="#brands">Brands</a>
        </nav>
        <Button asChild className="account-button">
          <Link href="/account">
            My account <ArrowRight />
          </Link>
        </Button>
      </header>

      <section className="hero">
        <Image
          src="/fashion-hero.webp"
          alt="Curated secondhand clothing, shoes and accessories"
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-shade" />
        <div className="hero-copy">
          <p className="eyebrow">Your items. Our work. Your earnings.</p>
          <h1>
            We sell it
            <br />
            for you.
          </h1>
          <p>
            No photos, listings, buyer messages or meetups for you to manage.
            Request a pickup and relax—we collect, inspect, price and sell your
            items.
          </p>
          <div className="hero-actions">
            <Button asChild size="lg">
              <Link href="/account">
                Request easy pickup <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#sell">See how easy it is</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="shipping-strip" aria-label="Canada delivery policy">
        <Truck />
        <div>
          <strong>{shipping.canadaWideEnabled === false ? "Delivery policy" : "Shop from anywhere in Canada."}</strong>
          <span>{shippingSummary}</span>
        </div>
        <Link href="/shipping-policy">Delivery details</Link>
      </section>

      <ShopCatalog products={catalogProducts} />

      <section id="sell" className="process-section">
        <div className="process-intro">
          <p className="eyebrow">The effortless way to resell</p>
          <h2>
            We pick it up.
            <br />
            You’re done.
          </h2>
          <p>
            From your door to the buyer, our team handles every step. You can
            follow progress whenever you want.
          </p>
          <Button asChild variant="secondary">
            <Link href="/account">Arrange collection</Link>
          </Button>
        </div>
        <ol className="steps">
          <li>
            <b>01</b>
            <div>
              <h3>Tell us you’re ready</h3>
              <p>Open your account and request a Bag or collection in just a few steps.</p>
            </div>
          </li>
          <li>
            <b>02</b>
            <div>
              <h3>We collect and prepare everything</h3>
              <p>Our team receives, inspects, photographs, prices and lists your accepted clothing, shoes, accessories and electronics.</p>
            </div>
          </li>
          <li>
            <b>03</b>
            <div>
              <h3>We sell. You earn.</h3>
              <p>We handle buyers and the sale. Your earnings are tracked in your account according to the current payout process.</p>
            </div>
          </li>
        </ol>
      </section>

      <CommissionSection />

      <section className="guarantee-section">
        <div>
          <ShieldCheck />
          <p className="eyebrow">Company-managed shopping</p>
          <h2>Listings are prepared and reviewed by Rewear.</h2>
          <p>
            Accepted clothing, shoes and electronics are processed by our team before publication.
            If an item does not match its listing, contact Support and we’ll review the case under the current approved policy.
          </p>
          <Button asChild variant="secondary"><a href="#shop">Browse items</a></Button>
        </div>
      </section>

      <section id="brands" className="brands section-wrap">
        <p className="eyebrow dark">Brands we love</p>
        <h2>Recognizable names. Real value.</h2>
        <div className="brand-cloud">
          {brands.map((b) => <span key={b}>{b}</span>)}
        </div>
        <p className="brands-note">Brand names must be visible on the item’s original label or marking. Authenticity checks may apply.</p>
      </section>

      <footer>
        <div className="brand">REWEAR<span>.</span></div>
        <p>Women · Men · Kids · Shoes · Electronics</p>
        <div className="footer-links">
          <Link href="/pickup-policy">Pickup policy</Link>
          <Link href="/shipping-policy">Shipping policy</Link>
          <Link href="/account">Customer account</Link>
        </div>
      </footer>
    </main>
  );
}
