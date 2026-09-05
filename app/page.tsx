import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Gavel, ShieldCheck, Truck } from "lucide-react";
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
const featured = [
  { type: "Wool coat", brand: "Aritzia", price: "$89", crop: 0 },
  { type: "Straight jeans", brand: "Levi’s", price: "$48", crop: 1 },
  { type: "Leather bag", brand: "Coach", price: "$125", crop: 2 },
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

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_items");

  if (error) {
    console.error("[home] catalog load failed", { code: error.code, message: error.message });
  }

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
          <a href="#shoes">Shoes</a>
          <a href="#sell">Sell with us</a>
          <a href="#auction">Auction</a>
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
          <strong>Shop from anywhere in Canada.</strong>
          <span>Free local delivery in Montréal and the configured 20 km local radius. Shipping fees apply outside the local area.</span>
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
              <p>We handle buyers and the sale. Your earnings appear in your account to spend or withdraw.</p>
            </div>
          </li>
        </ol>
      </section>

      <CommissionSection />

      <section id="auction" className="auction-section section-wrap">
        <div className="section-heading">
          <div>
            <p className="eyebrow dark">Rewear auction</p>
            <h2>Last chance, great finds.</h2>
          </div>
          <p>Selected pieces, new opportunities and great prices.</p>
        </div>
        <div className="auction-grid">
          {featured.map((item, i) => (
            <article key={item.type}>
              <div className={`auction-photo product-photo crop${item.crop}`}>
                <Image src="/featured-products.webp" alt={`${item.brand} ${item.type}`} fill sizes="320px" />
              </div>
              <div className="auction-info">
                <span><Gavel /> {i === 0 ? "2h 14m" : "1d 08h"} left</span>
                <h3>{item.brand} {item.type}</h3>
                <p>Current bid</p>
                <b>{i === 0 ? "$34" : "$28"}</b>
                <Button variant="outline">View auction</Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="guarantee-section">
        <div>
          <ShieldCheck />
          <p className="eyebrow">Company-backed shopping</p>
          <h2>Every product is guaranteed by us.</h2>
          <p>
            Clothing, shoes and electronics—including phones, laptops and desktop
            computers—are inspected and covered by Rewear’s company guarantee.
            If an item does not match its listing, our team handles the resolution.
          </p>
          <Button asChild variant="secondary"><a href="#shop">Shop with confidence</a></Button>
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
