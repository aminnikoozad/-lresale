import { localizedMetadata } from "@/lib/localized-metadata";

import { Localize } from "@/components/site-language";
import { BrandWordmark } from "@/components/brand-wordmark";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPin, PackageCheck, Truck } from "lucide-react";
import { BAND_NAMES } from "@/lib/postal";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";
export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
  title: "Shipping & Local Delivery",
  description: "Canada-wide Shikimomo shipping policy and Montréal local free-delivery policy.",
}, {"title": "Expédition et livraison locale", "description": "Politique de livraison Shikimomo au Canada et de livraison locale gratuite à Montréal."});
}

type ShippingPolicy = {
  canadaWideEnabled: boolean;
  localCenterName: string;
  localFreeRadiusKm: number;
  nonlocalFeeMode: "carrier_quote" | "flat_fee";
  nonlocalFlatFeeCents: number | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export default async function ShippingPolicyPage() {
  // Shipping policy is public content, so do not inherit a visitor's auth
  // cookies. A stale session must not affect this page.
  const supabase = createPublicClient();
  const { data: bands } = await supabase.rpc("postal_weight_bands");
  const { data, error } = await supabase.rpc("get_shipping_policy");
  if (error) {
    console.error("[shipping-policy] policy load failed", { code: error.code, message: error.message });
  }

  const policy = (data ?? {
    canadaWideEnabled: true,
    localCenterName: "Montréal",
    localFreeRadiusKm: 20,
    nonlocalFeeMode: "carrier_quote",
    nonlocalFlatFeeCents: null,
  }) as ShippingPolicy;

  const outsideText = policy.nonlocalFeeMode === "flat_fee" && policy.nonlocalFlatFeeCents != null
    ? `${money(policy.nonlocalFlatFeeCents)} flat shipping fee`
    : "a shipping fee calculated for the destination and parcel";

  return <Localize>{(
    <main className="shipping-policy-page">
      <header className="policy-header"><Link href="/" className="brand"><BrandWordmark /></Link><Link href="/account">My account</Link></header>
      <article className="legal-policy">
        <div className="policy-hero">
          <p className="eyebrow dark">Shopping delivery</p>
          <h1>Canada-wide delivery policy.</h1>
          <p>Delivery options and fees depend on your address.</p>
        </div>

        <section className="policy-highlight"><PackageCheck/><div><h2>Canada-wide availability</h2><p>{policy.canadaWideEnabled ? "We deliver across Canada." : "Delivery across Canada is temporarily unavailable."}</p></div></section>

        <div className="shipping-note-grid">
          <div><MapPin/><b>Local area</b><span>{policy.localCenterName} and up to about {policy.localFreeRadiusKm} km nearby.</span></div>
          <div><Truck/><b>Local delivery</b><span>Delivery is free within our local area.</span></div>
          <div><PackageCheck/><b>Outside local area</b><span>Orders elsewhere in Canada use {outsideText}.</span></div>
        </div>

        <section><h2>Parcel weight ranges</h2><p>Canada Post rates depend on the packed weight, parcel size and destination. These weight ranges do not have fixed prices.</p>{Array.isArray(bands) ? <ul>{bands.map((grams: number, i: number) => <li key={i}><strong>{BAND_NAMES[i]}</strong>: {i === 0 ? "up to" : `over ${bands[i-1]/1000} kg and up to`} {grams/1000} kg</li>)}</ul> : <p>We’ll check parcel limits before shipping.</p>}<p>We may need to check missing measurements, large parcels or restricted items. If a rate is unavailable, we’ll ask you to try again. Rates include shipping taxes and carrier surcharges and are valid for 10 minutes. We currently ship within Canada only.</p></section>
        <section><h2>Your delivery address</h2><p>We confirm delivery options and fees using your full address before you place your order. Your city alone doesn’t confirm free delivery.</p></section>
        <section><h2>Remote and oversized shipments</h2><p>Large parcels or remote addresses may need another delivery service. We’ll check the options before you place your order.</p></section>
        <section><h2>Pickup and seller collection are separate</h2><p>This page covers delivery of your purchases. For seller pickups and bags or boxes, see our Pickup Policy.</p></section>
        <Link className="policy-back" href="/"><ArrowLeft/> Back to Shikimomo</Link>
      </article>
    </main>
  )}</Localize>;
}
