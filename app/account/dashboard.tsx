"use client";
import { Localize } from "@/components/site-language";
import { SellingMethodTabs } from "@/components/selling-method-tabs";


import { HomeIntake } from "@/components/home-intake";
import {
  CATALOG_CATEGORIES,
  FASHION_CATEGORIES,
  categoryLabel,
  type CatalogCategory,
} from "@/lib/catalog-taxonomy";
import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BadgePercent,
  CheckCircle2,
  CircleDollarSign,
  Package,
  Shirt,
  Truck,
  Wallet,
} from "lucide-react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PickupTimePicker } from "@/components/pickup-time-picker";
import { createCollectionRequest } from "./actions";
import type { CommissionTier } from "@/lib/business-rules";

type Item = {
  id: string;
  name: string;
  status: string;
  initialPrice: string;
  initialPriceCents?: number;
  currentPrice: string;
  sellerRate: string;
  platformRate: string;
  estimatedEarnings: string;
  finalEarnings: string;
};
type Request = {
  id: string;
  batchCode: string;
  type: string;
  category: string;
  status: string;
  confirmationStatus: string;
  createdAt: string;
  expectedItemCount: number;
  receivedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  processingFee: string;
  bagFee: string;
  pickupFee: string;
  promotionLabel: string | null;
};
type ServiceArea = { id: string; city: string; pickupMode: string };
type PickupSlot = {
  id: string;
  serviceAreaId: string;
  label: string;
  date: string;
  remaining: number;
};
type FeeRules = {
  minimumItemValueCents: number;
  minimumPickupEstimatedValueCents: number;
  commissionTiers: CommissionTier[];
  processingFeeCents: number;
  rewearBagFeeCents: number;
  freePickupThresholdCents: number;
  bagMinimumEstimatedValueCents: number;
};
type LaunchOffer = {
  active: boolean;
  eligible: boolean;
  maxClaims: number;
  remaining: number;
  waivedServiceFeeCents: number;
};
type Props = {
  teamPricingAccepted?: boolean;
  name: string;
  username: string;
  customerCode: string;
  message: string | null;
  messageType: "success" | "error";
  balance: string;
  activeItemCount: number;
  totalEarned: string;
  items: Item[];
  requests: Request[];
  serviceAreas: ServiceArea[];
  pickupSlots: PickupSlot[];
  feeRules: FeeRules;
  launchOffer: LaunchOffer;
  activeCategories?: CatalogCategory[];
  pilotEnabled?: boolean;
  pickupDayText?: string;
};

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function Dashboard({
  teamPricingAccepted = false,
  name,
  message,
  messageType,
  balance,
  activeItemCount,
  totalEarned,
  items,
  requests,
  pickupSlots,
  feeRules,
  launchOffer,
  activeCategories = ["women"],
  pilotEnabled = true,
}: Props) {
  const activeCategoryLabels = CATALOG_CATEGORIES.filter((entry) => activeCategories.includes(entry.value)).map((entry) => entry.label).join(", ");
  const showLaunchOffer = launchOffer.active && launchOffer.eligible;
  return <Localize>{(
    <div className="dashboard">
      <SellingMethodTabs />
      <section className="welcome">
        <div>
          <p className="eyebrow dark">Seller account</p>
          <h1 style={{fontSize:"clamp(1.25rem, 2.4vw, 1.75rem)",lineHeight:1.3,letterSpacing:"-.02em"}}>Welcome, {name}.</h1>
          <p>
            See your balance, follow every item and arrange your next
            collection.
          </p>
        </div>
        <div className="dash-actions">
          <RequestDialog
            type="bag"
            label="Request a Shikimomo Bag"
            icon={<Package />}
            pickupSlots={pickupSlots}
            activeCategories={activeCategories}
            pilotEnabled={pilotEnabled}
            feeRules={feeRules}
            launchOffer={launchOffer}
            teamPricingAccepted={teamPricingAccepted}
          />
          <RequestDialog
            type="pickup"
            label="Use my own bag / box"
            icon={<Truck />}
            pickupSlots={pickupSlots}
            activeCategories={activeCategories}
            pilotEnabled={pilotEnabled}
            feeRules={feeRules}
            launchOffer={launchOffer}
            teamPricingAccepted={teamPricingAccepted}
          />
        </div>
      </section>
      {showLaunchOffer ? (
        <div className="launch-offer-account">
          <BadgePercent />
          <div>
            <b>Your first collection may qualify for the launch offer.</b>
            <span>{launchOffer.remaining} of {launchOffer.maxClaims} launch spots currently remain. If a spot is still available when your first collection request is successfully submitted, the regular {cad(launchOffer.waivedServiceFeeCents)} batch service fee is waived automatically. Account creation alone does not reserve a spot.</span>
          </div>
        </div>
      ) : null}
      {message && (
        <div className={`success-banner ${messageType}`}>
          {messageType === "success" ? <CheckCircle2 /> : <AlertCircle />}
          {message}
        </div>
      )}
      <section className="stats">
        <article className="balance-stat">
          <div>
            <Wallet />
            <span>Confirmed managed-selling balance</span>
          </div>
          <strong>{balance}</strong>
          <small>Only items sold by Shikimomo</small>
          <Link href="/account/seller/earnings">View earnings &amp; payouts →</Link>
        </article>
        <article>
          <div>
            <Shirt />
            <span>Active items</span>
          </div>
          <strong>{activeItemCount}</strong>
          <small>{pilotEnabled ? `${activeCategoryLabels || "Selected categories"} accepted now` : "Accepted Shikimomo inventory"}</small>
        </article>
        <article>
          <div>
            <CircleDollarSign />
            <span>Earned through Shikimomo</span>
          </div>
          <strong>{totalEarned}</strong>
          <small>Confirmed sale earnings</small>
        </article>
      </section>
      <section className="account-panel">
        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">My items</TabsTrigger>
            <TabsTrigger value="requests">My batches</TabsTrigger>
            <TabsTrigger value="payout">Earnings &amp; payouts</TabsTrigger>
          </TabsList>
          <TabsContent value="items">
            <div className="panel-title">
              <div>
                <h2>Items we’re handling for you</h2>
                <p>
                  Follow each item from inspection and pricing to sale and your earnings.
                </p>
              </div>
              <RequestDialog
                type="pickup"
                label="Arrange collection"
                icon={<Truck />}
                pickupSlots={pickupSlots}
                activeCategories={activeCategories}
                pilotEnabled={pilotEnabled}
                feeRules={feeRules}
                launchOffer={launchOffer}
            teamPricingAccepted={teamPricingAccepted}
              />
            </div>
            {items.length ? (
              <div className="seller-items">
                {items.map((item) => (
                  <article
                    className="seller-item"
                    key={item.id}
                  >
                    <header>
                      <div>
                        <h3 translate="no">{item.name}</h3>
                        <span>
                          <i
                            className={`status ${item.status.toLowerCase().replaceAll(" ", "-")}`}
                          />
                          {item.status}
                        </span>
                      </div>
                    </header>
                    <dl>
                      <div><dt>Initial approved price</dt><dd>{item.initialPrice}</dd></div>
                      <div><dt>Current selling price</dt><dd>{item.currentPrice}</dd></div>
                      <div><dt>Your share</dt><dd>{item.sellerRate}</dd></div>
                      <div><dt>Platform commission</dt><dd>{item.platformRate}</dd></div>
                      <div><dt>Estimated earnings</dt><dd>{item.estimatedEarnings}</dd></div>
                      <div><dt>Final earnings after sale</dt><dd>{item.finalEarnings}</dd></div>
                    </dl>

                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-box">
                <Shirt />
                <h2>No items yet</h2>
                <p>Your accepted items will appear here after collection and inspection.</p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="requests">
            {requests.length ? (
              <div className="request-list">
                {requests.map((request) => (
                  <article key={request.id}>
                    <div>
                      <b>{request.batchCode}</b>
                      <span>{request.type} · {request.category} · {request.createdAt}</span>
                      <small>{request.status} · Confirmation: {request.confirmationStatus}</small>
                    </div>
                    <div className="batch-progress">
                      <strong>{request.receivedCount}/{request.expectedItemCount || "?"} received</strong>
                      <small>{request.acceptedCount} accepted · {request.rejectedCount} rejected</small>
                      {request.promotionLabel ? <small className="batch-promo">{request.promotionLabel}</small> : null}
                      <small>Fees: {request.processingFee} service{request.pickupFee !== "$0" && request.pickupFee !== "$0.00" ? ` · ${request.pickupFee} pickup` : ""}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-box">
                <Package />
                <h2>No batches yet</h2>
                <p>Start with a Shikimomo Bag or use your own bag/box. Every new batch receives a trackable batch code.</p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="payout">
            <div className="payout-box">
              <Wallet />
              <div>
                <h2>Confirmed managed-selling balance: {balance}</h2>
                <p>Bank payouts aren’t available online yet. Check your earnings or contact Support.</p>
              </div>
              <Link href="/account/seller/earnings">View earnings &amp; payouts →</Link>
            </div>
          </TabsContent>
        </Tabs>
      </section>
      <section className="mini-rules">
        <b>Quick check before sending</b>
        <span>✓ Items must pass inspection before listing</span>
        <span>✓ Pickup and processing are covered by the batch service fee, with no extra transportation charge</span>
        {showLaunchOffer ? (
          <span>✓ Launch offer: regular {cad(feeRules.processingFeeCents)} first-batch service fee is waived if one of the remaining {launchOffer.remaining} spots is claimed at successful submission</span>
        ) : (
          <span>✓ Batch service fee is {cad(feeRules.processingFeeCents)} once per new batch; a Shikimomo Bag is included if requested</span>
        )}
        <span>✓ Clothing should be washed and neatly folded</span>
        <Link href="/sell-with-shikimomo">Read the full seller guide →</Link>
      </section>
    </div>
  )}</Localize>;
}

function RequestDialog({
  teamPricingAccepted,
  label,
  icon,
  type,
  pickupSlots,
  activeCategories,
  pilotEnabled,
  feeRules,
  launchOffer,
}: {
  teamPricingAccepted: boolean;
  label: string;
  icon: React.ReactNode;
  type: "bag" | "pickup";
  pickupSlots: PickupSlot[];
  activeCategories: CatalogCategory[];
  pilotEnabled: boolean;
  feeRules: FeeRules;
  launchOffer: LaunchOffer;
}) {
  const [open, setOpen] = useState(false);
  const mixedClothing = !pilotEnabled || ["women", "men", "kids"].every(value => activeCategories.includes(value as CatalogCategory));
  const [category, setCategory] = useState<string>(mixedClothing ? "clothing" : activeCategories[0] ?? "women");
  const [estimatedValue, setEstimatedValue] = useState(feeRules.freePickupThresholdCents / 100);
  const availableSlots = pickupSlots;
  const fashionCategory = category === "clothing" || FASHION_CATEGORIES.includes(category as CatalogCategory);
  const collectionLabel = category === "clothing" ? "Mixed clothing" : categoryLabel(category);
  const categoryOptions = CATALOG_CATEGORIES.filter((entry) => activeCategories.includes(entry.value));
  const collectionMinimum = cad(feeRules.minimumPickupEstimatedValueCents);
  const itemMinimum = cad(feeRules.minimumItemValueCents);
  const processingFee = cad(feeRules.processingFeeCents);
  const launchEligible = launchOffer.active && launchOffer.eligible;

  return <Localize>{(
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={type === "bag" ? "default" : "outline"}>{icon}{label}</Button>
      </DialogTrigger>
      <DialogContent className="request-dialog">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Tell us what you want collected. All applicable fees are shown before you submit.
          </DialogDescription>
        </DialogHeader>
        <form className="request-form" action={createCollectionRequest}>
          <div className="request-form-scroll">
            <input type="hidden" name="request_type" value={type} />
            <label>
              What are we collecting?
              <select
                name="category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                }}
              >
                {mixedClothing ? <option value="clothing">Mixed clothing</option> : null}
                {categoryOptions.map((entry) => (
                  <option value={entry.value} key={entry.value}>{entry.label}</option>
                ))}
              </select>
            </label>
            {category === "home_decor" ? <HomeIntake /> : null}
            <p>Pickup in Montréal and nearby areas. We confirm coverage from your full address.</p>
            <PickupTimePicker slots={availableSlots} />
            <div className="hold-card">
              <Truck />
              <div>
                <b>{launchEligible ? "Launch offer may apply to this first collection" : type === "bag" ? `Shikimomo Bag · included in ${processingFee}` : "Own bag / box · pickup included"}</b>
                <p>{launchEligible
                  ? `The regular ${processingFee} pickup and processing fee will be waived if a launch spot remains when this first collection is successfully submitted.`
                  : `One ${processingFee} fee covers pickup and processing for this batch. A Shikimomo Bag is included if requested.`}</p>
              </div>
            </div>
            <fieldset className="pickup-address-fields">
              <legend>Collection address &amp; contact</legend>
              <label>Street address<Input name="street_address" required minLength={5} maxLength={200} autoComplete="address-line1" placeholder="Street number and street name" /></label>
              <label>Apartment / unit (optional)<Input name="address_unit" maxLength={50} autoComplete="address-line2" /></label>
              <label>City<Input name="address_city" required minLength={2} maxLength={100} autoComplete="address-level2" /></label>
              <label>Province<Input name="address_province" value="Quebec" readOnly autoComplete="address-level1" /></label>
              <label>Postal code<Input name="postal_code" required maxLength={7} autoComplete="postal-code" pattern="[ABCEGHJ-NPRSTVXYabceghj-nprstvxy][0-9][ABCEGHJ-NPRSTVWXYZabceghj-nprstvwxyz] ?[0-9][ABCEGHJ-NPRSTVWXYZabceghj-nprstvwxyz][0-9]" placeholder="H2X 1Y4" /></label>
              <label>Phone number<Input name="contact_phone" required type="tel" maxLength={25} autoComplete="tel" placeholder="514 555 0123" /></label>
            </fieldset>
            <label>
              Approximate number of items
              <Input name="item_count" required type="number" min="1" max="500" step="1" inputMode="numeric" placeholder="For example: 12" />
            </label>
            <label>
              Brands (optional)
              <Input name="brands" maxLength={500} placeholder="For example: Aritzia, Nike, Levi’s" />
            </label>
            <label>
              Estimated total resale value
              <Input
                name="estimated_value"
                required
                type="number"
                min={String(Math.max(feeRules.minimumPickupEstimatedValueCents, type === "bag" ? feeRules.bagMinimumEstimatedValueCents : 0) / 100)}
                max="1000000"
                step="0.01"
                inputMode="decimal"
                value={estimatedValue}
                onChange={(event) => setEstimatedValue(Number(event.target.value))}
                placeholder={`${collectionMinimum} minimum combined value`}
              />
            </label>
            <p>We collect batches with an estimated combined resale value of at least {collectionMinimum}. This is your estimate; each item is inspected and priced separately.</p>
            <details className="collection-terms-details">
              <summary>View collection terms &amp; fees</summary>
              <p>{launchEligible
                ? `The regular batch service fee is ${processingFee}. It is waived only if a launch spot remains at successful submission; signing up does not reserve a spot.`
                : `One ${processingFee} service fee includes a Shikimomo Bag if requested. It comes out of your earnings when payouts are available, not your card upfront.`}</p>
            <div className="terms-box">
              <b>Required terms for {collectionLabel}</b>
              {category === "home_decor" ? (
                <>
                  <p>• Items must be clean, structurally sound, inspectable and suitable for resale.</p>
                  <p>• Acceptance depends on current category value requirements, condition and shipping feasibility. Restricted or uncertain items require review.</p>
                  <p>• Seller information is preliminary. Shikimomo determines listing details after physical inspection.</p>
                </>
              ) : fashionCategory ? (
                <>
                  <p>• Individual listings normally require an approved resale value of at least {itemMinimum}. Lower-value eligible items may be combined into a bundle.</p>
                  <p>• Clothes must be freshly washed or cleaned as appropriate, hygienic, complete and in good wearable condition, without stains, tears, holes or significant damage. Disclose any flaws before pickup.</p>
                  <p>• Shikimomo inspects every item after collection and rejects any item that fails these conditions, even if the estimated batch total met {collectionMinimum}.</p>
                  <p>• Accepted fashion items are listed for up to 90 days. Choose what happens to unsold items in your account.</p>
                </>
              ) : (
                <>
                  <p>• Devices must power on, function properly and be free of serious physical damage unless disclosed for review.</p>
                  <p>• You must verify ownership. We may check identification, serial numbers or IMEI.</p>
                  <p>• Passwords, user accounts and activation locks must be removed before collection.</p>
                  <p>• Our technicians test the device and Shikimomo determines its resale value.</p>
                </>
              )}
              <p>{pilotEnabled ? `• Choose an open pickup time in the calendar. Appointments are confirmed by Shikimomo.` : "• Pickup appointments depend on current service-area and scheduling availability."}</p>
              <p>• Your commission is locked from the initial approved item price. Current tiers: {feeRules.commissionTiers.map((tier) => `${cad(tier.minCents)}${tier.maxCents === null ? "+" : `–${cad(tier.maxCents)}`}: ${tier.sellerBps / 100}%`).join("; ")} seller share.</p>
              <p>• Mixed clothing is welcome. Shikimomo sorts and categorizes each item after inspection.</p>
              <p>• <Link href="/sell-with-shikimomo" target="_blank">Read acceptance, pricing, fees and earnings in the Seller Guide.</Link></p>
            </div>
              <p><Link href="/seller-terms" target="_blank" rel="noopener noreferrer">Seller Terms</Link> · <Link href="/pickup-policy" target="_blank" rel="noopener noreferrer">Pickup &amp; Missed Pickup Policy</Link></p>
            </details>
            {!teamPricingAccepted ? <input type="hidden" name="pricing_mandate_version" value="2026-10-15-team-v1" /> : null}
            <label className="check">
              <input name="collection_terms_accepted" value="accepted" required type="checkbox" />{" "}
              <span>I confirm my items meet the requirements and accept the collection terms, commission and displayed fees.{!teamPricingAccepted ? " I authorize Shikimomo to price my current and future items after inspection." : ""}</span>
            </label>
          </div>
          <div className="request-form-footer">
            <PendingSubmitButton disabled={!availableSlots.length} pendingLabel="Submitting request…">Submit collection request</PendingSubmitButton>
            <small className="payment-note">Pickup requires confirmation by Shikimomo.</small>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )}</Localize>;
}

