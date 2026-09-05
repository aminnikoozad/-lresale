import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Gavel, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommissionSection } from "@/components/commission-section";
import { ShopCatalog } from "./shop-catalog";

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

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link href="/" className="brand">
          REWEAR<span>.</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#shop">Shop</a>
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
          alt="Curated secondhand clothing and accessories"
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

      <ShopCatalog />
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
              <p>
                Open your account and request a Bag or collection in just a few
                steps.
              </p>
            </div>
          </li>
          <li>
            <b>02</b>
            <div>
              <h3>We collect and prepare everything</h3>
              <p>
                Our team receives, inspects, photographs, prices and lists your
                accepted items.
              </p>
            </div>
          </li>
          <li>
            <b>03</b>
            <div>
              <h3>We sell. You earn.</h3>
              <p>
                We handle buyers and the sale. Your earnings appear in your
                account to spend or withdraw.
              </p>
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
                <Image
                  src="/featured-products.webp"
                  alt={`${item.brand} ${item.type}`}
                  fill
                  sizes="320px"
                />
              </div>
              <div className="auction-info">
                <span>
                  <Gavel /> {i === 0 ? "2h 14m" : "1d 08h"} left
                </span>
                <h3>
                  {item.brand} {item.type}
                </h3>
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
            Clothing and electronics—including phones, laptops and desktop
            computers—are inspected and covered by Rewear’s company guarantee.
            If an item does not match its listing, our team handles the
            resolution.
          </p>
          <Button asChild variant="secondary">
            <a href="#shop">Shop with confidence</a>
          </Button>
        </div>
      </section>
      <section id="brands" className="brands section-wrap">
        <p className="eyebrow dark">Brands we love</p>
        <h2>Recognizable names. Real value.</h2>
        <div className="brand-cloud">
          {brands.map((b) => (
            <span key={b}>{b}</span>
          ))}
        </div>
        <p className="brands-note">
          Brand names must be visible on the item’s original label or marking.
          Authenticity checks may apply.
        </p>
      </section>
      <footer>
        <div className="brand">
          REWEAR<span>.</span>
        </div>
        <p>Women · Men · Kids · Electronics</p>
        <div className="footer-links">
          <Link href="/pickup-policy">Pickup policy</Link>
          <Link href="/account">Customer account</Link>
        </div>
      </footer>
    </main>
  );
}
