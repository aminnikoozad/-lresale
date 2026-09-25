import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, CalendarClock, Truck } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { formatCadFromCents, loadSellingRules } from "@/lib/business-rules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pickup & Missed Pickup Policy | Rewear",
  description: "Rewear pickup fees, processing fees, Bag eligibility, confirmation and missed pickup policy.",
};

export default async function PickupPolicyPage() {
  const rules = await loadSellingRules(createPublicClient());
  const threshold = formatCadFromCents(rules.pickupRules.freePickupThresholdCents);
  const perItem = formatCadFromCents(rules.pickupRules.lowValuePickupItemFeeCents);
  const bagMinimum = formatCadFromCents(rules.pickupRules.bagMinimumEstimatedValueCents);
  const processing = formatCadFromCents(rules.pickupRules.processingFeeCents);
  const bagFee = formatCadFromCents(rules.pickupRules.rewearBagFeeCents);
  const missLimit = rules.pickupRules.suspendFreePickupAfterMisses;

  return <main className="pickup-policy-page">
    <header className="policy-header"><Link href="/" className="brand">REWEAR<span>.</span></Link><Link href="/account">My account</Link></header>
    <article className="legal-policy">
      <div className="policy-hero"><p className="eyebrow dark">Customer policy</p><h1>Pickup &amp; Intake Fee Policy</h1><p>Pickup, Bag and processing fees are shown before a new collection request is submitted.</p><small>Updated September 24, 2026</small></div>

      <section className="policy-highlight"><Truck/><div><h2>{threshold}+ Free Priority Pickup</h2><p>When the estimated combined resale value of your pickup is <strong>{threshold} CAD or more</strong>, the transportation portion of pickup is free and the request receives priority handling.</p><p>A separate <strong>{processing} processing fee per new batch</strong> still applies. This covers intake, inspection and listing preparation work that exists regardless of pickup value.</p></div></section>

      <section><h2>Pickups Below {threshold}</h2><p>Pickup requests below {threshold} in estimated combined resale value are allowed, but a transportation fee of <strong>{perItem} CAD per item</strong> applies in addition to the batch processing fee.</p><p>The applicable pickup fee is calculated from the number of items included in the request and is shown before submission.</p></section>

      <section className="policy-highlight"><BadgeCheck/><div><h2>REWEAR Bag vs. Your Own Bag / Box</h2><p>A REWEAR Bag request is available when the submitted items have an estimated combined resale value of at least <strong>{bagMinimum}</strong>. The REWEAR Bag fee is <strong>{bagFee}</strong>.</p><p>You may use your own suitable bag or box instead. In that case there is <strong>no Bag fee</strong>. The {processing} batch processing fee still applies.</p></div></section>

      <section><h2>Processing Fee</h2><p>Each new collection batch records a <strong>{processing}</strong> processing fee once per batch, not once per item. The fee is intended to be deducted from seller earnings when settlement is available rather than charged to a payment card upfront.</p><p>The fee is snapshotted on the batch when the request is created, so a later policy change does not rewrite the fee on an older batch.</p></section>

      <section><h2>Pickup Confirmation</h2><p>Customers may receive a reminder approximately 24 hours before pickup and a second reminder closer to the pickup window. A pickup must be confirmed before REWEAR dispatches it.</p><ul><li>Confirmed → eligible for dispatch.</li><li>Cancelled or rescheduled before dispatch → not treated as a missed pickup.</li><li>Not confirmed → REWEAR does not dispatch the pickup.</li></ul></section>

      <section><h2>Pickup Time Windows</h2><p>Pickup times may be provided as a time window rather than an exact arrival time.</p><div className="time-window"><CalendarClock/><strong>Example: 6:00 PM – 8:00 PM</strong></div><p>This lets REWEAR organize efficient routes. Customers may also receive a notification when the driver is approaching.</p></section>

      <section><h2>What Counts as a Missed Pickup?</h2><p>A true missed pickup is recorded only after the seller confirmed the appointment and REWEAR attempted the pickup, but it could not be completed because the seller or items were unavailable.</p><p>A request that was never confirmed is not treated as the same thing as a driver no-show event.</p></section>

      <section><h2>Repeated Confirmed No-Shows</h2><p>REWEAR currently does not charge a first- or second-missed-pickup cash fee under the active rules. After <strong>{missLimit} confirmed missed pickups</strong>, free-pickup access may be suspended. Other options may remain available.</p><p>This rule is intended to protect route capacity and driver time, not to punish customers who cancel early.</p></section>

      <section><h2>Pickup Eligibility</h2><p>Before approval, we may request the approximate number of items, categories, brands, estimated resale value and photos. Submitting a pickup request does not guarantee acceptance of the items themselves; final acceptance happens after physical inspection.</p></section>

      <section><h2>Why These Thresholds Exist</h2><p>Pickup, inspection, photography and listing preparation create real work even when an item has a low resale value. The threshold and processing structure help keep free pickup sustainable while making the cost visible before you commit.</p><p>For a full explanation of acceptance, pricing and seller earnings, see the <Link href="/sell-with-rewear">Seller Guide</Link>.</p></section>

      <Link className="policy-back" href="/"><ArrowLeft/> Back to Rewear</Link>
    </article>
  </main>;
}
