"use client";

import { HomeIntake } from "@/components/home-intake";
import {
  CATALOG_CATEGORIES,
  FASHION_CATEGORIES,
  categoryLabel,
  subcategoriesFor,
  type CatalogCategory,
} from "@/lib/catalog-taxonomy";
import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Package,
  Shirt,
  ShoppingBag,
  Truck,
  Wallet,
} from "lucide-react";
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
import { approveItemPricing, createCollectionRequest } from "./actions";

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
  requiresApproval: boolean;
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
};
type ServiceArea = { id: string; city: string; pickupMode: string };
type PickupSlot = {
  id: string;
  serviceAreaId: string;
  label: string;
  remaining: number;
};
type FeeRules = {
  processingFeeCents: number;
  rewearBagFeeCents: number;
  freePickupThresholdCents: number;
  lowValuePickupItemFeeCents: number;
  bagMinimumEstimatedValueCents: number;
};
type Props = {
  name: string;
  username: string;
  customerCode: string;
  message: string | null;
  messageType: "success" | "error";
  balance: string;
  totalEarned: string;
  items: Item[];
  requests: Request[];
  serviceAreas: ServiceArea[];
  pickupSlots: PickupSlot[];
  feeRules: FeeRules;
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
  name,
  username,
  customerCode,
  message,
  messageType,
  balance,
  totalEarned,
  items,
  requests,
  serviceAreas,
  pickupSlots,
  feeRules,
  activeCategories = ["women"],
  pilotEnabled = true,
  pickupDayText = "Saturdays",
}: Props) {
  const activeCategoryLabels = CATALOG_CATEGORIES.filter((entry) => activeCategories.includes(entry.value)).map((entry) => entry.label).join(", ");
  return (
    <div className="dashboard">
      <section className="welcome">
        <div>
          <p className="eyebrow dark">Customer dashboard</p>
          <h1>Welcome, {name}.</h1>
          <div className="customer-identifiers" aria-label="Customer identifiers">
            <span>@{username}</span>
            <span>Customer ID: <strong>{customerCode}</strong></span>
          </div>
          <p>
            See your balance, follow every item and arrange your next
            collection.
          </p>
        </div>
        <div className="dash-actions">
          <RequestDialog
            type="bag"
            label="Request a REWEAR Bag"
            icon={<Package />}
            serviceAreas={serviceAreas}
            pickupSlots={pickupSlots}
            activeCategories={activeCategories}
            pilotEnabled={pilotEnabled}
            pickupDayText={pickupDayText}
            feeRules={feeRules}
          />
          <RequestDialog
            type="pickup"
            label="Use my own bag / box"
            icon={<Truck />}
            serviceAreas={serviceAreas}
            pickupSlots={pickupSlots}
            activeCategories={activeCategories}
            pilotEnabled={pilotEnabled}
            pickupDayText={pickupDayText}
            feeRules={feeRules}
          />
        </div>
      </section>
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
            <span>Available balance</span>
          </div>
          <strong>{balance}</strong>
          <small>Completed wallet balance recorded in your account</small>
          <Button size="sm" disabled>
            <ShoppingBag /> Balance checkout coming later
          </Button>
        </article>
        <article>
          <div>
            <Shirt />
            <span>Items with us</span>
          </div>
          <strong>{items.length}</strong>
          <small>{pilotEnabled ? `${activeCategoryLabels || "Selected categories"} during the pilot` : "Accepted Rewear inventory"}</small>
        </article>
        <article>
          <div>
            <CircleDollarSign />
            <span>Total earned</span>
          </div>
          <strong>{totalEarned}</strong>
          <small>Completed sale credits</small>
        </article>
      </section>
      <section className="account-panel">
        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">My items</TabsTrigger>
            <TabsTrigger value="requests">My batches</TabsTrigger>
            <TabsTrigger value="payout">Payout</TabsTrigger>
          </TabsList>
          <TabsContent value="items">
            <div className="panel-title">
              <div>
                <h2>Items we’re handling for you</h2>
                <p>
                  Review pricing, approve your locked commission and follow each
                  item through sale and payout.
                </p>
              </div>
              <RequestDialog
                type="pickup"
                label="Arrange collection"
                icon={<Truck />}
                serviceAreas={serviceAreas}
                pickupSlots={pickupSlots}
                activeCategories={activeCategories}
                pilotEnabled={pilotEnabled}
                pickupDayText={pickupDayText}
                feeRules={feeRules}
              />
            </div>
            {items.length ? (
              <div className="seller-items">
                {items.map((item) => (
                  <article
                    className={`seller-item ${item.requiresApproval ? "needs-approval" : ""}`}
                    key={item.id}
                  >
                    <header>
                      <div>
                        <h3>{item.name}</h3>
                        <span>
                          <i
                            className={`status ${item.status.toLowerCase().replaceAll(" ", "-")}`}
                          />
                          {item.status}
                        </span>
                      </div>
                      {item.requiresApproval ? <b>Approval needed</b> : null}
                    </header>
                    <dl>
                      <div><dt>Initial approved price</dt><dd>{item.initialPrice}</dd></div>
                      <div><dt>Current selling price</dt><dd>{item.currentPrice}</dd></div>
                      <div><dt>Your share</dt><dd>{item.sellerRate}</dd></div>
                      <div><dt>Platform commission</dt><dd>{item.platformRate}</dd></div>
                      <div><dt>Estimated earnings</dt><dd>{item.estimatedEarnings}</dd></div>
                      <div><dt>Final earnings after sale</dt><dd>{item.finalEarnings}</dd></div>
                    </dl>
                    {item.requiresApproval ? (
                      <div className="pricing-approval">
                        <p>
                          By approving, you accept the initial price and
                          commission shown above. The percentage will remain
                          locked even if the item is discounted later.
                        </p>
                        <form action={approveItemPricing}>
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="expected_price" value={item.initialPriceCents} />
                          <Button type="submit">Approve price &amp; commission</Button>
                        </form>
                      </div>
                    ) : null}
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
                      <small>Fees: {request.processingFee} processing{request.bagFee !== "$0" && request.bagFee !== "$0.00" ? ` · ${request.bagFee} Bag` : ""}{request.pickupFee !== "$0" && request.pickupFee !== "$0.00" ? ` · ${request.pickupFee} pickup` : ""}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-box">
                <Package />
                <h2>No batches yet</h2>
                <p>Start with a REWEAR Bag or use your own bag/box. Every new batch receives a trackable batch code.</p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="payout">
            <div className="payout-box">
              <Wallet />
              <div>
                <h2>{balance} available</h2>
                <p>Payout setup will become available after payment verification is connected.</p>
              </div>
              <Button disabled>Set up payout</Button>
            </div>
          </TabsContent>
        </Tabs>
      </section>
      <section className="consignment-status">
        <div className="end-choice">
          <b>Item timeline &amp; unsold preferences</b>
          <Link href="/account/operations">Manage item operations →</Link>
          <small>Track processing, review deadlines, automatic publishing, Last Chance and choose Return or Donate / Reuse for unsold items.</small>
        </div>
      </section>
      <section className="mini-rules">
        <b>Quick check before sending</b>
        <span>✓ Individual listing value is normally $20+</span>
        <span>✓ {cad(feeRules.freePickupThresholdCents)}+ estimated collections qualify for free priority pickup</span>
        <span>✓ Processing is {cad(feeRules.processingFeeCents)} once per new batch</span>
        <span>✓ A REWEAR Bag is {cad(feeRules.rewearBagFeeCents)}; your own bag/box has no Bag fee</span>
        <span>✓ Clothing should be washed and neatly folded</span>
        <Link href="/sell-with-rewear">Read the full seller guide →</Link>
      </section>
    </div>
  );
}

function RequestDialog({
  label,
  icon,
  type,
  serviceAreas,
  pickupSlots,
  activeCategories,
  pilotEnabled,
  pickupDayText,
  feeRules,
}: {
  label: string;
  icon: React.ReactNode;
  type: "bag" | "pickup";
  serviceAreas: ServiceArea[];
  pickupSlots: PickupSlot[];
  activeCategories: CatalogCategory[];
  pilotEnabled: boolean;
  pickupDayText: string;
  feeRules: FeeRules;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CatalogCategory>(activeCategories[0] ?? "women");
  const [subcategory, setSubcategory] = useState("");
  const [serviceAreaId, setServiceAreaId] = useState(serviceAreas[0]?.id ?? "");
  const [estimatedValue, setEstimatedValue] = useState(feeRules.freePickupThresholdCents / 100);
  const availableSlots = pickupSlots.filter((slot) => slot.serviceAreaId === serviceAreaId);
  const paidPickup = type === "pickup" && estimatedValue > 0 && estimatedValue * 100 < feeRules.freePickupThresholdCents;
  const fashionCategory = FASHION_CATEGORIES.includes(category);
  const subcategoryOptions = subcategoriesFor(category);
  const categoryOptions = CATALOG_CATEGORIES.filter((entry) => activeCategories.includes(entry.value));
  const threshold = cad(feeRules.freePickupThresholdCents);
  const perItemFee = cad(feeRules.lowValuePickupItemFeeCents);
  const bagMinimum = cad(feeRules.bagMinimumEstimatedValueCents);
  const processingFee = cad(feeRules.processingFeeCents);
  const bagFee = cad(feeRules.rewearBagFeeCents);

  return (
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
                  setCategory(event.target.value as CatalogCategory);
                  setSubcategory("");
                }}
              >
                {categoryOptions.map((entry) => (
                  <option value={entry.value} key={entry.value}>{entry.label}</option>
                ))}
              </select>
            </label>
            {category === "home_decor" ? (
              <HomeIntake />
            ) : (
              <label>
                Subcategory
                <select
                  name="subcategory_hint"
                  required
                  value={subcategory}
                  onChange={(event) => setSubcategory(event.target.value)}
                >
                  <option value="" disabled>Choose a subcategory</option>
                  {subcategoryOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                </select>
              </label>
            )}
            <label>
              Pickup city
              <select
                name="service_area_id"
                value={serviceAreaId}
                onChange={(event) => setServiceAreaId(event.target.value)}
                required
              >
                <option value="" disabled>Select a city</option>
                {serviceAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.city}{area.pickupMode === "free" ? " — Pickup available" : " — Subject to review"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Available pickup time
              <select name="pickup_slot_id" required defaultValue="">
                <option value="" disabled>Select an available time</option>
                {availableSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>{slot.label} · {slot.remaining} spots left</option>
                ))}
              </select>
            </label>
            {!availableSlots.length ? <p className="slot-note">No pickup times are currently open for this city. Please check again after new times are added.</p> : null}
            <div className="hold-card">
              <Truck />
              <div>
                <b>{type === "bag" ? `REWEAR Bag · ${bagFee}` : paidPickup ? "Own bag / box · smaller pickup" : "Own bag / box · free priority pickup"}</b>
                <p>
                  {type === "bag"
                    ? `REWEAR Bag requests require at least ${bagMinimum} estimated resale value. A ${bagFee} Bag fee and ${processingFee} batch processing fee are recorded on the new batch.`
                    : paidPickup
                      ? `Your own bag/box has no Bag fee. This batch records ${processingFee} processing plus ${perItemFee} per item because the estimated resale value is below ${threshold}.`
                      : `Your own bag/box has no Bag fee. This batch records ${processingFee} processing; ${threshold} or more qualifies for free priority pickup.`}
                </p>
              </div>
            </div>
            <label>
              Collection address
              <Input name="address" required minLength={10} maxLength={500} autoComplete="street-address" placeholder="Street address, city, postal code" />
            </label>
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
                min={type === "bag" ? String(feeRules.bagMinimumEstimatedValueCents / 100) : "0.01"}
                max="1000000"
                step="0.01"
                inputMode="decimal"
                value={estimatedValue}
                onChange={(event) => setEstimatedValue(Number(event.target.value))}
                placeholder={type === "bag" ? `${bagMinimum} minimum for a REWEAR Bag` : "Enter your estimated total"}
              />
            </label>
            {paidPickup ? (
              <label className="check pickup-fee-check">
                <input name="pickup_fee_accepted" value="accepted" required type="checkbox" />{" "}
                I understand that pickups below {threshold} currently cost {perItemFee} per item.
              </label>
            ) : null}
            <label className="check">
              <input name="service_fee_accepted" value="accepted" required type="checkbox" />{" "}
              I understand this new batch records a {processingFee} processing fee{type === "bag" ? ` plus a ${bagFee} REWEAR Bag fee` : "; my own bag/box has no Bag fee"}. These fees are intended to be deducted from seller earnings when settlement is available, not charged to my card upfront.
            </label>
            <div className="terms-box">
              <b>Required terms for {categoryLabel(category)}</b>
              {category === "home_decor" ? (
                <>
                  <p>• Items must be clean, structurally sound, inspectable and suitable for resale.</p>
                  <p>• Acceptance depends on current category value requirements, condition and shipping feasibility. Restricted or uncertain items require review.</p>
                  <p>• Seller information is preliminary. REWEAR determines listing details after physical inspection.</p>
                </>
              ) : fashionCategory ? (
                <>
                  <p>• Individual listings normally require an approved value of at least $20. Lower-value items may be combined into a bundle.</p>
                  <p>• Items must be washed or cleaned as appropriate and free of undisclosed stains, tears, holes or missing parts.</p>
                  <p>• Accepted fashion items are listed for up to 90 days. Unsold item choices can be managed from your item operations page.</p>
                </>
              ) : (
                <>
                  <p>• Devices must power on, function properly and be free of serious physical damage unless disclosed for review.</p>
                  <p>• You must verify ownership. We may check identification, serial numbers or IMEI.</p>
                  <p>• Passwords, user accounts and activation locks must be removed before collection.</p>
                  <p>• Our technicians test the device and REWEAR determines its resale value.</p>
                </>
              )}
              <p>{pilotEnabled ? `• During the pilot, pickup appointments are offered on ${pickupDayText} only and confirmed by REWEAR.` : "• Pickup appointments depend on current service-area and scheduling availability."}</p>
              <p>• Your commission is locked from the initial approved item price: you receive 45% at $20–$99.99, 50% at $100–$249.99, 55% at $250–$499.99 and 65% at $500+.</p>
              <p>• Category and subcategory details are intake information; REWEAR confirms final listing taxonomy after physical inspection.</p>
              <p>• <Link href="/sell-with-rewear" target="_blank">Read acceptance, pricing, fees and earnings in the Seller Guide.</Link></p>
            </div>
            <label className="check">
              <input name="condition_confirmed" value="accepted" required type="checkbox" />{" "}
              I confirm my {categoryLabel(category)} items meet the condition, ownership and minimum-value requirements.
            </label>
            <label className="check">
              <input name="policy_accepted" value="accepted" required type="checkbox" />{" "}
              I accept the selling period and commission rates.
            </label>
            <label className="check">
              <input name="pickup_policy_accepted" value="accepted" required type="checkbox" />{" "}
              <span>I accept the <Link href="/pickup-policy" target="_blank">Pickup &amp; Missed Pickup Policy</Link>.</span>
            </label>
          </div>
          <div className="request-form-footer">
            <Button type="submit" disabled={!availableSlots.length}>Submit collection request</Button>
            <small className="payment-note">A new batch code and fee snapshot are created when you submit. Pickup still requires confirmation before dispatch.</small>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
