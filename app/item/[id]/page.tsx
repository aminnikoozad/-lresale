import {
  fieldLabel,
  galleryOrder,
  type HomePhoto,
  type HomeData,
} from "@/lib/home-decor";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  ChevronLeft,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import {
  AddToCartButton,
  FavoriteButton,
} from "@/components/storefront-actions";

type Props = { params: Promise<{ id: string }> };
type Product = {
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
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("catalog_item_detail_v3", {
    target_item_id: id,
  });
  if (error) {
    console.error("[product] catalog detail failed", {
      code: error.code,
      message: error.message,
    });
    notFound();
  }

  const product = ((data ?? [])[0] ?? null) as Product | null;
  if (!product || !product.photo_urls?.length) notFound();

  const homeResult =
    product.category === "home_decor"
      ? await supabase.rpc("home_catalog_details", { target_item_id: id })
      : null;
  const home = homeResult?.data?.[0]?.details as
    (HomeData & { disclosed_defects?: string[] }) | undefined;
  const homePhotos = galleryOrder(
    (homeResult?.data?.[0]?.photos ?? []) as HomePhoto[],
  );
  const photos = homePhotos.length
    ? homePhotos
    : product.photo_urls.map((url) => ({ url, role: "" }));
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
        <Link href="/#shop">
          <ChevronLeft /> Back to shop
        </Link>
        <Link href="/cart">View bag</Link>
      </div>

      <div className="product-layout">
        <section
          className="product-gallery"
          aria-label={`${product.brand} ${product.name} photos`}
        >
          {photos.map(({ url, role }, index) => (
            <div className="product-image" key={`${url}-${index}`}>
              <Image
                src={url}
                alt={`${product.brand} ${product.name} ${role || `photo ${index + 1}`}`}
                fill
                sizes="(max-width: 800px) 100vw, 50vw"
                priority={index === 0}
              />
              {role ? (
                <span className="home-gallery-role">{fieldLabel(role)}</span>
              ) : null}
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
          <p className="product-availability-note">
            Unique secondhand item. Availability is rechecked before an order is
            created.
          </p>

          <div className="product-actions">
            <AddToCartButton item={cartItem} />
            <FavoriteButton itemId={product.item_id} />
          </div>

          <div className="product-trust product-trust-primary">
            <ShieldCheck />
            <div>
              <b>Inspected by REWEAR</b>
              <span>
                Our team physically reviews condition and listing details before
                publication
                {inspectedOn ? ` · inspected ${inspectedOn}` : ""}.
              </span>
            </div>
          </div>

          <dl className="product-specs">
            {product.subcategory ? (
              <div>
                <dt>Subcategory</dt>
                <dd>{product.subcategory}</dd>
              </div>
            ) : null}
            {product.size ? (
              <div>
                <dt>Size</dt>
                <dd>{product.size}</dd>
              </div>
            ) : null}
            {product.item_condition ? (
              <div>
                <dt>Condition</dt>
                <dd>{product.item_condition}</dd>
              </div>
            ) : null}
            {product.color ? (
              <div>
                <dt>Colour</dt>
                <dd>{product.color}</dd>
              </div>
            ) : null}
            {product.material ? (
              <div>
                <dt>Material</dt>
                <dd>{product.material}</dd>
              </div>
            ) : null}
            {product.pattern ? (
              <div>
                <dt>Pattern</dt>
                <dd>{product.pattern}</dd>
              </div>
            ) : null}
            <div>
              <dt>Category</dt>
              <dd>
                {product.category === "home_decor"
                  ? "Home & Decor"
                  : product.category}
              </dd>
            </div>
          </dl>

          {home ? (
            <section
              className="home-product-details"
              aria-label="Home and Decor details"
            >
              <h2>About this piece</h2>
              <dl className="product-specs">
                {[
                  "designer",
                  "era",
                  "height_cm",
                  "width_cm",
                  "depth_cm",
                  "diameter_cm",
                  "weight_kg",
                  "country_of_origin",
                  "model_collection",
                  "authentication_status",
                ]
                  .filter((k) => home[k] != null && home[k] !== "")
                  .map((k) => (
                    <div key={k}>
                      <dt>{k === "era" ? "Approximate era" : fieldLabel(k)}</dt>
                      <dd>{String(home[k])}</dd>
                    </div>
                  ))}
                {["handmade", "signed_marked"]
                  .filter((k) => typeof home[k] === "boolean")
                  .map((k) => (
                    <div key={k}>
                      <dt>{fieldLabel(k)}</dt>
                      <dd>{home[k] ? "Yes" : "No"}</dd>
                    </div>
                  ))}
              </dl>
              {home.era && home.era !== "Unknown" ? (
                <p>
                  Era estimated by REWEAR based on available item information.
                </p>
              ) : null}
              {home.disclosed_defects?.length || home.visible_defects ? (
                <div className="condition-panel">
                  <div>
                    <h2>Disclosed defects</h2>
                    {home.disclosed_defects?.length ? (
                      <p>{home.disclosed_defects.join(", ")}</p>
                    ) : null}
                    {home.visible_defects ? (
                      <p>{String(home.visible_defects)}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <details>
                <summary>History &amp; additional details</summary>
                {[
                  "secondary_colour",
                  "approximate_year",
                  "missing_components",
                  "restoration_history",
                  "provenance_notes",
                ]
                  .filter((k) => home[k] != null && home[k] !== "")
                  .map((k) => (
                    <p key={k}>
                      <b>
                        {k === "approximate_year"
                          ? "Estimated year"
                          : fieldLabel(k)}
                        :
                      </b>{" "}
                      {String(home[k])}
                    </p>
                  ))}
              </details>
              <details open>
                <summary>Handling &amp; delivery</summary>
                {home.fragile ? (
                  <p>
                    Fragile item — careful handling and protective packaging are
                    required.
                  </p>
                ) : null}
                {home.pickup_only ? (
                  <p>
                    This item is eligible for collection only. Contact REWEAR to
                    arrange fulfilment.
                  </p>
                ) : null}
                {home.delivery_note ? (
                  <p>{String(home.delivery_note)}</p>
                ) : null}
                {home.shipping_restrictions ? (
                  <p>{String(home.shipping_restrictions)}</p>
                ) : null}
                <p>
                  Delivery arrangements and any applicable shipping charge must
                  be confirmed before payment. No final shipping rate is
                  confirmed on this page.
                </p>
              </details>
            </section>
          ) : null}
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

          <section
            className="product-service-grid"
            aria-label="Shopping information"
          >
            <div>
              <Truck />
              <span>
                <b>
                  {product.category === "home_decor"
                    ? "Delivery review"
                    : "Delivery-ready"}
                </b>
                Shipping cost will be confirmed before payment.
              </span>
            </div>
            <div>
              <RotateCcw />
              <span>
                <b>Return & claim support</b>Eligible issues can be submitted
                from My Purchases after delivery.
              </span>
            </div>
            <div>
              <ShieldCheck />
              <span>
                <b>Centralized support</b>REWEAR handles fulfilment and
                post-purchase support.
              </span>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
