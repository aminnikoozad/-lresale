import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, CalendarClock, Truck } from "lucide-react";

export const metadata: Metadata = {
  title: "Pickup & Missed Pickup Policy | Rewear",
  description: "Rewear pickup fees, priority pickup, Bag or Box eligibility, confirmation and missed pickup policy.",
};

export default function PickupPolicyPage() {
  return <main className="pickup-policy-page">
    <header className="policy-header"><Link href="/" className="brand">REWEAR<span>.</span></Link><Link href="/account">My account</Link></header>
    <article className="legal-policy">
      <div className="policy-hero"><p className="eyebrow dark">Customer policy</p><h1>Pickup &amp; Missed Pickup Policy</h1><p>Pickup pricing depends on the estimated combined resale value of the items you ask us to collect.</p><small>Effective September 24, 2026</small></div>

      <section className="policy-highlight"><Truck/><div><h2>$100+ Free Priority Pickup</h2><p>When the estimated combined resale value of your pickup is <strong>$100 CAD or more</strong>, pickup is free and the request receives priority handling. There is no pickup fee, deposit or card hold.</p><p>Pickup remains subject to service-area and time-slot availability. We may contact you to confirm the pickup window before the driver is dispatched.</p></div></section>

      <section><h2>Pickups Below $100</h2><p>Pickup requests below $100 in estimated combined resale value are still allowed, but a pickup fee of <strong>$5 CAD per item</strong> applies.</p><div className="earnings-example"><span>Estimated resale value <b>$75</b></span><span>Items to collect <b>6</b></span><strong>Pickup fee <b>$30</b></strong></div><p>The fee is calculated from the number of items included in the pickup request. The applicable fee is shown or confirmed before the request is finalized.</p></section>

      <section className="policy-highlight"><BadgeCheck/><div><h2>Bag / Box Requests</h2><p>A Bag or Box request is available only when the submitted items have an estimated combined resale value of at least <strong>$100 CAD</strong>.</p><p>If the estimated value is below $100, you cannot request a Bag or Box. You may instead request a standard pickup and the $5-per-item pickup fee will apply.</p></div></section>

      <section><h2>Pickup Confirmation</h2><p>Customers may receive:</p><ul><li>A reminder approximately 24 hours before the scheduled pickup.</li><li>A final reminder before the pickup window.</li><li>The option to confirm, cancel or reschedule the pickup.</li></ul><p>Cancelling or rescheduling before the required confirmation deadline is free of charge.</p></section>
      <section><h2>Pickup Time Windows</h2><p>Pickup times may be provided as a time window rather than an exact arrival time. For example:</p><div className="time-window"><CalendarClock/><strong>6:00 PM – 8:00 PM</strong></div><p>This allows us to organize efficient pickup routes throughout Montreal. Customers may also receive a notification when the driver is approaching.</p></section>
      <section><h2>Missed Pickup Policy</h2><p>We understand that plans can change.</p><div className="missed-grid"><div><b>First missed confirmed pickup</b><span>No fee is charged. We will remind you to confirm or cancel your next pickup.</span></div><div><b>Second missed confirmed pickup</b><span>Pickup access is temporarily suspended pending review. No amount is deducted from seller earnings.</span></div><div><b>Third or repeated missed pickups</b><span>Free pickup privileges may be suspended or removed. Other options, such as drop-off or paid pickup, may remain available.</span></div></div></section>
      <section><h2>What Is Considered a Missed Pickup?</h2><p>A pickup may be considered missed when:</p><ul><li>The customer confirmed the pickup but is unavailable during the agreed pickup window.</li><li>The driver is unable to access the pickup location.</li><li>The customer does not provide the items after confirming the pickup.</li><li>The driver reasonably attempts to contact the customer but cannot complete the pickup.</li></ul><p>A pickup properly cancelled or rescheduled before the applicable deadline is not considered missed.</p></section>
      <section><h2>No earnings deduction</h2><p>Missed pickups never result in deductions from future seller earnings. A deposit option is not currently active; any future deposit requires clear terms and your agreement.</p></section>
      <section><h2>Pickup Eligibility</h2><p>Before approval, we may request:</p><ul><li>Approximate number of items.</li><li>Item categories and brands.</li><li>Estimated resale value.</li><li>Photos of the items or Bag / Box.</li></ul><p>Submitting a pickup request does not guarantee acceptance of the items themselves. Items are still inspected under our selling rules after collection.</p></section>
      <section><h2>Fair Use</h2><p>The purpose of this policy is to keep pickup convenient while covering transportation costs for smaller collections.</p><p>We reserve the right to restrict or suspend pickup access in cases of repeated missed appointments, misuse of the pickup system, materially inaccurate information or other activity that creates unreasonable operational costs.</p></section>
      <Link className="policy-back" href="/"><ArrowLeft/> Back to Rewear</Link>
    </article>
  </main>;
}
