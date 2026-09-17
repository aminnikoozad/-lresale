import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ChevronLeft, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { AddToCartButton, FavoriteButton } from "@/components/storefront-actions";

type Props = { params: Promise<{ id: string }> };
type Product = {
  item_id: string;
  name: string;
  brand: string;
  category: string;
  size: string | null;
  item_condition: string | null;
  color: string | null;
  material: string | null;
  pattern: string | null;
  condition_notes: string | null;
  photo_urls: string[];
  description: string | null;
  price_cents: number;
  published_at: string | null;
  inspected_at: string | null;
};

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function inspectionDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(new Date(value));
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("catalog_item_detail", { target_item_id: id });
  if (error) {
    console.error("[product] catalog detail failed", { code: error.code, message: error.message });
    notFound();
  }

  const product = ((data ?? [])[0] ?? null) as Product | null;
  if (!product || !product.photo_urls?.length) notFound();

  const cartItem = {
    id: product.item_id,
    name: product.name,
    brand: product.brand,
    priceCents: product.price_cents,
    photoUrl: product.photo_urls[0],
    size: product.size,
    condition: product.item_condition,
  };
  const inspectedOn = inspectionDate(product.inspected_at);

  return (
    <main className="product-page section-wrap">
      <div className="product-topbar">
        <Link href="/#shop"><ChevronLeft /> Back to shop</Link>
        <Link href="/cart">View bag</Link>
      </div>

      <div className="product-layout">
        <section className="product-gallery" aria-label={`${product.brand} ${product.name} photos`}>
          {product.photo_urls.map((url, index) => (
            <div className="product-image" key={`${url}-${index}`}>
              <Image
                src={url}
                alt={`${product.brand} ${product.name} photo ${index + 1}`}
                fill
                sizes="(max-width: 800px) 100vw, 50vw"
                priority={index === 0}
              />
            </div>
          ))}
        </section>

        <aside className="product-summary">
          <div className="product-kicker-row">
            <p className="eyebrow dark">{product.brand}</p>
            <span className="one-of-one-badge">One of one</span>
          </div>
          <h1>{product.name}</h1>
          <strong className="product-price">{cad(product.price_cents)}</strong>
          <p className="product-availability-note">Unique secondhand item. Availability is rechecked before an order is created.</p>

          <div className="product-actions">
            <AddToCartButton item={cartItem} />
            <FavoriteButton itemId={product.item_id} />
          </div>

          <div className="product-trust product-trust-primary">
            <ShieldCheck />
            <div>
              <b>Inspected by REWEAR</b>
              <span>
                Our team reviews condition and listing details before publication
                {inspectedOn ? ` · inspected ${inspectedOn}` : ""}.
              </span>
            </div>
          </div>

          <dl className="product-specs">
            {product.size ? <div><dt>Size</dt><dd>{product.size}</dd></div> : null}
            {product.item_condition ? <div><dt>Condition</dt><dd>{product.item_condition}</dd></div> : null}
            {product.color ? <div><dt>Colour</dt><dd>{product.color}</dd></div> : null}
            {product.material ? <div><dt>Material</dt><dd>{product.material}</dd></div> : null}
            {product.pattern ? <div><dt>Pattern</dt><dd>{product.pattern}</dd></div> : null}
            <div><dt>Category</dt><dd>{product.category}</dd></div>
          </dl>

          {product.condition_notes ? (
            <section className="condition-panel">
              <BadgeCheck />
              <div>
                <h2>Condition notes</h2>
                <p>{product.condition_notes}</p>
              </div>
            </section>
          ) : null}

          {product.description ? (
            <section className="product-description">
              <h2>Details</h2>
              <p>{product.description}</p>
            </section>
          ) : null}

          <section className="product-service-grid" aria-label="Shopping information">
            <div><Truck /><span><b>Delivery-ready</b>Shipping cost will be confirmed before payment.</span></div>
            <div><RotateCcw /><span><b>Return & claim support</b>Eligible issues can be submitted from My Purchases after delivery.</span></div>
            <div><ShieldCheck /><span><b>Centralized support</b>REWEAR handles fulfilment and post-purchase support.</span></div>
          </section>
        </aside>
      </div>
    </main>
  );
}
