import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, CircleDollarSign, PackageCheck, SearchCheck, Truck } from "lucide-react";
import { SellerEarningsCalculator } from "@/components/seller-earnings-calculator";
import { createPublicClient } from "@/lib/supabase/public";
import { formatCadFromCents, loadSellingRules, tierPriceLabel } from "@/lib/business-rules";
import "./seller-guide.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sell with REWEAR | Fees, acceptance & earnings",
  description: "See how REWEAR pickup, inspection, pricing, commission, service fees and seller earnings work before you send anything.",
};

export default async function SellWithRewearPage() {
  const supabase = createPublicClient();
  const rules = await loadSellingRules(supabase);
  const serviceFee = formatCadFromCents(rules.pickupRules.processingFeeCents);
  const freePickupThreshold = formatCadFromCents(rules.pickupRules.freePickupThresholdCents);
  const lowValueFee = formatCadFromCents(rules.pickupRules.lowValuePickupItemFeeCents);

  return (
    <main className="seller-guide-shell">
      <header className="seller-guide-top">
        <Link href="/" className="brand">REWEAR<span>.</span></Link>
        <nav><Link href="/#shop">Shop</Link><Link href="/pickup-policy">Pickup policy</Link><Link href="/account">My account</Link></nav>
      </header>

      <section className="seller-guide-hero">
        <p className="eyebrow">Sell with clarity</p>
        <h1>You send the pieces.<br />We handle the resale work.</h1>
        <p>Before you book a pickup, see exactly what REWEAR accepts, how we price items, what the fees are and how your share is calculated.</p>
        <div><Link className="guide-primary" href="/account">Start a collection <ArrowRight /></Link><a className="guide-secondary" href="#fees">See fees & earnings</a></div>
      </section>

      <section className="guide-section" id="how-it-works">
        <div className="guide-heading"><p className="eyebrow dark">How it works</p><h2>One managed process, from your door to the buyer.</h2></div>
        <ol className="guide-steps">
          <li><Truck /><b>1. Pickup</b><p>Request a REWEAR Bag or use your own bag/box and book an available pickup window.</p></li>
          <li><SearchCheck /><b>2. Inspection</b><p>We identify every item, check condition and decide whether it is suitable for resale.</p></li>
          <li><Camera /><b>3. Photography & pricing</b><p>Accepted items are photographed, prepared and priced by REWEAR.</p></li>
          <li><CheckCircle2 /><b>4. Seller review</b><p>You review the initial price and your commission before the item is published.</p></li>
          <li><PackageCheck /><b>5. Listing & sale</b><p>We publish the item, manage the buyer and track the item through the selling period.</p></li>
          <li><CircleDollarSign /><b>6. Earnings</b><p>Your seller share and applicable batch fees remain visible in your account.</p></li>
        </ol>
      </section>

      <section className="guide-section guide-fees" id="fees">
        <div className="guide-heading"><p className="eyebrow dark">Fees & earnings</p><h2>No surprise charges.</h2><p>The batch service fee is shown before you submit a new collection request and is snapshotted on that request, so future rule changes do not rewrite an older batch.</p></div>
        <div className="fee-cards">
          <article><span>Batch service fee</span><strong>{serviceFee}</strong><p>Once per new batch/pickup. This single fee covers processing and includes a REWEAR Bag if you request one. There is no separate Bag charge.</p></article>
          <article><span>Use your own bag / box</span><strong>No extra charge</strong><p>You still pay the same {serviceFee} batch service fee; using your own suitable bag or box does not add another fee.</p></article>
          <article><span>Pickup</span><strong>{freePickupThreshold}+ = free</strong><p>Below {freePickupThreshold}, standard pickup is {lowValueFee} per item. This transportation fee is separate from the batch service fee.</p></article>
        </div>

        <div className="commission-wrap">
          <div><h3>How much you keep</h3><p>Your commission tier is based on the item’s initial approved price and stays locked after you approve it.</p></div>
          <div className="commission-table" role="table" aria-label="Seller commission tiers">
            <div className="commission-row head" role="row"><span>Initial approved price</span><span>You keep</span></div>
            {rules.commissionTiers.map((tier) => <div className="commission-row" role="row" key={`${tier.minCents}-${tier.maxCents ?? "plus"}`}><span>{tierPriceLabel(tier)}</span><strong>{tier.sellerBps / 100}%</strong></div>)}
          </div>
        </div>

        <div className="calculator-wrap">
          <div><h3>Estimate your earnings</h3><p>This is an estimate, not a payout promise. The {serviceFee} batch service fee is charged once per batch rather than once per item.</p></div>
          <SellerEarningsCalculator tiers={rules.commissionTiers} processingFeeCents={rules.pickupRules.processingFeeCents} minimumItemValueCents={rules.minimumIndividualItemValueCents} />
        </div>
      </section>

      <section className="guide-section" id="acceptance">
        <div className="guide-heading"><p className="eyebrow dark">What we accept</p><h2>Send items that have a realistic second life.</h2></div>
        <div className="accept-grid">
          <article className="good"><h3>Good to send</h3><ul><li>Clean women’s clothing in the categories currently enabled during the pilot.</li><li>Items in good resale condition with no undisclosed stains, tears, holes or missing parts.</li><li>Pieces with a likely individual resale value of at least {formatCadFromCents(rules.minimumIndividualItemValueCents)}.</li><li>Lower-value compatible pieces that may make sense as a bundle.</li><li>Items with clear brand, size and care labels when available.</li></ul></article>
          <article className="avoid"><h3>Usually not a fit</h3><ul><li>Heavily stained, damaged, incomplete or unhygienic items.</li><li>Items whose condition cannot be verified safely.</li><li>Pieces with very low resale demand or value unless they can be bundled.</li><li>Items that do not match the categories currently enabled in the pilot.</li></ul></article>
        </div>
        <p className="guide-note">Submitting an item does not guarantee acceptance. Final acceptance happens after physical inspection.</p>
      </section>

      <section className="guide-section split-section" id="pricing">
        <div><p className="eyebrow dark">How we price</p><h2>Pricing is reviewed item by item.</h2><p>REWEAR considers the brand, category, condition, current resale demand, comparable market pricing and the item’s overall sellability. You see the initial approved price and your commission before publishing.</p><p>If an item is rejected, the seller-facing reason and evidence photo are kept separate from internal notes so you can understand the decision.</p></div>
        <div className="send-checklist"><h3>What should I send?</h3><p><b>Best candidates:</b> clean, current, easy-to-identify pieces in strong condition with realistic resale demand.</p><p><b>Think twice:</b> heavily worn basics, damaged pieces, missing components or anything you would be uncomfortable receiving as a buyer.</p><p><b>Before pickup:</b> wash or clean items as appropriate, fold them neatly and describe known flaws honestly.</p></div>
      </section>

      <section className="guide-cta"><div><p className="eyebrow">Ready?</p><h2>Know the rules before the pickup.</h2><p>Your account shows the single {serviceFee} batch service fee and any separate low-value pickup transportation fee before you submit.</p></div><Link href="/account">Arrange collection <ArrowRight /></Link></section>

      <footer className="seller-guide-footer"><Link href="/" className="brand">REWEAR<span>.</span></Link><div><Link href="/pickup-policy">Pickup policy</Link><Link href="/shipping-policy">Shipping policy</Link><Link href="/account">Customer account</Link></div></footer>
    </main>
  );
}
