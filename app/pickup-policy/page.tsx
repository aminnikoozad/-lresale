import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, CalendarClock, Truck } from "lucide-react";

export const metadata: Metadata = {
  title: "Pickup & Missed Pickup Policy | Rewear",
  description: "Rewear pickup confirmation, missed pickup and free pickup eligibility policy.",
};

export default function PickupPolicyPage() {
  return <main className="pickup-policy-page">
    <header className="policy-header"><Link href="/" className="brand">REWEAR<span>.</span></Link><Link href="/account">My account</Link></header>
    <article className="legal-policy">
      <div className="policy-hero"><p className="eyebrow dark">Customer policy</p><h1>Pickup &amp; Missed Pickup Policy</h1><p>We want pickups to be simple, flexible and free whenever possible.</p><small>Effective September 5, 2026</small></div>

      <section className="policy-highlight"><Truck/><div><h2>Free Pickup</h2><p>Eligible pickup requests within Montréal can be scheduled with no deposit, no card hold and no upfront pickup fee. Availability in surrounding cities may be limited or subject to review.</p><p>Before a pickup is added to our driver’s route, you may be asked to confirm by email, text message or through your account. If required confirmation is not received within the specified time, the pickup may be automatically cancelled.</p></div></section>
      <section><h2>Pickup Confirmation</h2><p>Customers may receive:</p><ul><li>A reminder approximately 24 hours before the scheduled pickup.</li><li>A final reminder before the pickup window.</li><li>The option to confirm, cancel or reschedule the pickup.</li></ul><p>Cancelling or rescheduling before the required confirmation deadline is free of charge.</p></section>
      <section><h2>Pickup Time Windows</h2><p>Pickup times may be provided as a time window rather than an exact arrival time. For example:</p><div className="time-window"><CalendarClock/><strong>6:00 PM – 8:00 PM</strong></div><p>This allows us to organize efficient pickup routes throughout Montreal. Customers may also receive a notification when the driver is approaching.</p></section>
      <section><h2>Missed Pickup Policy</h2><p>We understand that plans can change.</p><div className="missed-grid"><div><b>First missed confirmed pickup</b><span>No fee will be charged.</span></div><div><b>Second missed confirmed pickup</b><span>A $10 missed-pickup fee may be deducted from future seller earnings. No payment will be charged upfront to the customer’s card.</span></div><div><b>Third or repeated missed pickups</b><span>Free pickup privileges may be suspended or removed. Other options, such as drop-off or paid pickup, may remain available.</span></div></div></section>
      <section><h2>What Is Considered a Missed Pickup?</h2><p>A pickup may be considered missed when:</p><ul><li>The customer confirmed the pickup but is unavailable during the agreed pickup window.</li><li>The driver is unable to access the pickup location.</li><li>The customer does not provide the items after confirming the pickup.</li><li>The driver reasonably attempts to contact the customer but cannot complete the pickup.</li></ul><p>A pickup properly cancelled or rescheduled before the applicable deadline is not considered missed.</p></section>
      <section><h2>Future Earnings Deduction</h2><p>If a missed-pickup fee applies, it may be deducted from future earnings generated from items sold through our platform.</p><div className="earnings-example"><span>Seller earnings <b>$85</b></span><span>Missed-pickup fee <b>− $10</b></span><strong>Available payout <b>$75</b></strong></div><p>If no seller earnings are available, the fee may remain attached to the account until future earnings become available.</p></section>
      <section><h2>Pickup Eligibility</h2><p>Free pickup may be offered only for bags or item collections that meet our minimum eligibility requirements. Before approval, we may request:</p><ul><li>Approximate number of items.</li><li>Item categories and brands.</li><li>Estimated resale value.</li><li>Photos of the items or bag.</li></ul><p>Submitting a pickup request does not automatically guarantee free pickup approval.</p></section>
      <section className="policy-highlight"><BadgeCheck/><div><h2>Minimum Pickup Value</h2><p>Free pickup may require the submitted items to have an estimated combined resale value of at least $100. We may decline a request if the items are unlikely to meet our resale requirements.</p></div></section>
      <section><h2>Fair Use</h2><p>The purpose of this policy is to keep pickup free and convenient for reliable sellers while reducing unnecessary transportation and missed appointments.</p><p>We reserve the right to restrict or suspend pickup access in cases of repeated missed appointments, misuse of the pickup system, inaccurate information or other activity that creates unreasonable operational costs.</p></section>
      <Link className="policy-back" href="/"><ArrowLeft/> Back to Rewear</Link>
    </article>
  </main>;
}
