import { localizedMetadata } from "@/lib/localized-metadata";

import { Localize } from "@/components/site-language";
import { BrandWordmark } from "@/components/brand-wordmark";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, CircleDollarSign, PackageCheck, SearchCheck, Truck } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { formatCadFromCents, loadSellingRules } from "@/lib/business-rules";
import { loadPilotSettings } from "@/lib/pilot-settings";
import { loadLaunchSellerOffer } from "@/lib/launch-offer";
import { SellerGuideTables } from "@/components/seller-guide-tables";
import "./seller-guide.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
  alternates: { canonical: "/sell-with-shikimomo" },
  title: "Sell with Shikimomo | Fees, acceptance & earnings",
  description: "See how Shikimomo pickup, inspection, pricing, commission, service fees and seller earnings work before you send anything.",
}, {"title": "Vendre avec Shikimomo | Frais, critères et gains", "description": "Découvrez le fonctionnement des collectes, des inspections, des prix, des commissions, des frais de service et des gains avant de nous confier vos articles."});
}

export default async function SellWithShikimomoPage() {
  const supabase = createPublicClient();
  const [rules, launchOffer, pilot, personalFeeResult] = await Promise.all([
    loadSellingRules(supabase),
    loadLaunchSellerOffer(supabase),
    loadPilotSettings(supabase),
    supabase.rpc("personal_selling_fee_policy"),
  ]);
  const personalFees = personalFeeResult.error ? null : personalFeeResult.data;
  const serviceFee = formatCadFromCents(rules.pickupRules.processingFeeCents);
  const collectionMinimum = formatCadFromCents(rules.minimumPickupEstimatedValueCents);

  return <Localize>{(
    <main className="seller-guide-shell">
      <header className="seller-guide-top">
        <Link href="/" className="brand"><BrandWordmark /></Link>
        <nav><Link href="/shop#shop">Shop</Link><Link href="/pickup-policy">Pickup policy</Link><Link href="/account">My account</Link></nav>
      </header>

      <section className="seller-guide-hero">
        <p className="eyebrow">Sell with clarity</p>
        <h1>You send the pieces.<br />We handle the resale work.</h1>
        <p>Before you book a pickup, see exactly what Shikimomo accepts, how we price items, what the fees are and how your share is calculated.</p>
        <div><Link className="guide-primary" href="/account">Start a collection <ArrowRight /></Link><a className="guide-secondary" href="#fees">See fees & earnings</a></div>
      </section>

      <section lang="en"><SellerGuideTables rules={rules} launchOffer={launchOffer} pilot={pilot} personalFees={personalFees} /></section>
      <section lang="fr"><SellerGuideTables rules={rules} launchOffer={launchOffer} pilot={pilot} personalFees={personalFees} fr /></section>

      <section className="guide-section" id="how-it-works">
        <div className="guide-heading"><p className="eyebrow dark">How it works</p><h2>One managed process, from your door to the buyer.</h2></div>
        <ol className="guide-steps">
          <li><Truck /><b>1. Pickup</b><p>Request a Shikimomo Bag or use your own bag/box and book an available pickup window.</p></li>
          <li><SearchCheck /><b>2. Inspection</b><p>We identify every item, check condition and decide whether it is suitable for resale.</p></li>
          <li><Camera /><b>3. Photography & pricing</b><p>Accepted items are photographed, prepared and priced by Shikimomo.</p></li>
          <li><CheckCircle2 /><b>4. Pricing & publication</b><p>Shikimomo sets the price after inspection. Accept the team pricing terms once in your account so each item can be published without a separate price approval.</p></li>
          <li><PackageCheck /><b>5. Listing & sale</b><p>We publish the item, manage the buyer and track the item through the selling period.</p></li>
          <li><CircleDollarSign /><b>6. Earnings</b><p>Your seller share and applicable batch fees remain visible in your account.</p></li>
        </ol>
      </section>

      <section className="guide-section split-section" id="pricing">
        <div><p className="eyebrow dark">How we price</p><h2>Pricing is reviewed item by item.</h2><p>Shikimomo considers the brand, category, condition, current resale demand, comparable market pricing and the item’s overall sellability. You see the selling price before publication. Managed-selling commission is calculated when you request cash-out.</p><p>If we can’t accept an item, you’ll see the reason and a photo in your account.</p></div>
        <div className="send-checklist"><h3>What should I send?</h3><p><b>Batch minimum:</b> {collectionMinimum} estimated combined resale value for collection. This is an estimate, not a promise of acceptance or final pricing.</p><p><b>Best candidates:</b> clean, current, easy-to-identify pieces in strong condition with realistic resale demand.</p><p><b>Rejected after inspection:</b> unhygienic, stained, torn, incomplete or significantly damaged items, or items unsuitable for resale.</p><p><b>Before pickup:</b> wash or clean items as appropriate, fold them neatly and describe known flaws honestly.</p></div>
      </section>

      <section className="guide-cta"><div><p className="eyebrow">Ready?</p><h2>Know the rules before the pickup.</h2><p>{`Your account shows the regular ${serviceFee} pickup and processing fee before you submit.`}{launchOffer.active ? " If the launch waiver is successfully claimed, the service fee on that batch becomes $0 automatically." : ""}</p></div><Link href="/account">Arrange collection <ArrowRight /></Link></section>

      <footer className="seller-guide-footer"><Link href="/" className="brand"><BrandWordmark /></Link><div><Link href="/pickup-policy">Pickup policy</Link><Link href="/shipping-policy">Shipping policy</Link><Link href="/account">Customer account</Link></div></footer>
    </main>
  )}</Localize>;
}
