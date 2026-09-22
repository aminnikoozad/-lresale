import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPin, PackageCheck, Truck } from "lucide-react";
import { BAND_NAMES } from "@/lib/postal";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shipping & Local Delivery | Rewear",
  description: "Canada-wide Rewear shipping policy and Montréal local free-delivery policy.",
};

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

  return (
    <main className="shipping-policy-page">
      <header className="policy-header"><Link href="/" className="brand">REWEAR<span>.</span></Link><Link href="/account">My account</Link></header>
      <article className="legal-policy">
        <div className="policy-hero">
          <p className="eyebrow dark">Shopping delivery</p>
          <h1>Canada-wide delivery policy.</h1>
          <p>Rewear&apos;s shipping policy is configured for delivery across Canada. Local delivery pricing depends on the verified delivery address.</p>
        </div>

        <section className="policy-highlight"><PackageCheck/><div><h2>Canada-wide availability</h2><p>{policy.canadaWideEnabled ? "Canada-wide delivery is enabled in the current shipping policy." : "Canada-wide delivery is temporarily disabled."}</p></div></section>

        <div className="shipping-note-grid">
          <div><MapPin/><b>Local area</b><span>{policy.localCenterName} and addresses within approximately {policy.localFreeRadiusKm} km of the configured local centre.</span></div>
          <div><Truck/><b>Local delivery</b><span>Eligible local delivery is free when the verified delivery address falls inside the configured local radius.</span></div>
          <div><PackageCheck/><b>Outside local area</b><span>Orders elsewhere in Canada use {outsideText}.</span></div>
        </div>

        <section><h2>Postal parcel weight groups</h2><p>Canada Post quotes use the actual packed weight, package dimensions and destination postal code. These groups are not fixed-price postage bands.</p>{Array.isArray(bands) ? <ul>{bands.map((grams: number, i: number) => <li key={i}><strong>{BAND_NAMES[i]}</strong>: {i === 0 ? "up to" : `over ${bands[i-1]/1000} kg and up to`} {grams/1000} kg</li>)}</ul> : <p>Parcel limits are confirmed during shipping review.</p>}<p>Missing measurements, oversized packages and restricted items require manual review. A quote is only confirmed when a carrier rate is returned; no rate is invented if the connection is unavailable. Rates include carrier shipping taxes and surcharges and are valid for 10 minutes. Canadian destinations only; international shipping requires separate review.</p></section>
        <section><h2>Address verification</h2><p>The final delivery option and fee are confirmed from the delivery address before an order is finalized. A city name alone is not enough to guarantee free local delivery.</p></section>
        <section><h2>Remote and oversized shipments</h2><p>Carrier availability, oversized parcels and remote destinations may require a different shipping service or additional review before an order is finalized.</p></section>
        <section><h2>Pickup and seller collection are separate</h2><p>This delivery policy applies to buyers receiving purchases. Seller pickup pricing and Bag / Box eligibility are governed by the separate Pickup Policy.</p></section>
        <Link className="policy-back" href="/"><ArrowLeft/> Back to Rewear</Link>
      </article>
    </main>
  );
}
