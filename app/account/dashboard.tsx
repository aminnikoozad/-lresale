"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  HeartHandshake,
  Package,
  RotateCcw,
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
  type: string;
  category: string;
  status: string;
  confirmationStatus: string;
  createdAt: string;
};
type ServiceArea = { id: string; city: string; pickupMode: string };
type PickupSlot = {
  id: string;
  serviceAreaId: string;
  label: string;
  remaining: number;
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
};

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
}: Props) {
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
            label="Request a Bag"
            icon={<Package />}
            serviceAreas={serviceAreas}
            pickupSlots={pickupSlots}
          />
          <RequestDialog
            type="pickup"
            label="Request pickup"
            icon={<Truck />}
            serviceAreas={serviceAreas}
            pickupSlots={pickupSlots}
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
          <small>Use it to shop now or request payout later</small>
          <Button size="sm" disabled>
            <ShoppingBag /> Shop with balance
          </Button>
        </article>
        <article>
          <div>
            <Shirt />
            <span>Items with us</span>
          </div>
          <strong>{items.length}</strong>
          <small>Fashion and electronics</small>
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
            <TabsTrigger value="requests">My requests</TabsTrigger>
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
                      <div>
                        <dt>Initial approved price</dt>
                        <dd>{item.initialPrice}</dd>
                      </div>
                      <div>
                        <dt>Current selling price</dt>
                        <dd>{item.currentPrice}</dd>
                      </div>
                      <div>
                        <dt>Your share</dt>
                        <dd>{item.sellerRate}</dd>
                      </div>
                      <div>
                        <dt>Platform commission</dt>
                        <dd>{item.platformRate}</dd>
                      </div>
                      <div>
                        <dt>Estimated earnings</dt>
                        <dd>{item.estimatedEarnings}</dd>
                      </div>
                      <div>
                        <dt>Final earnings after sale</dt>
                        <dd>{item.finalEarnings}</dd>
                      </div>
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
                          <Button type="submit">
                            Approve price &amp; commission
                          </Button>
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
                <p>
                  Your accepted items will appear here after collection and
                  inspection.
                </p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="requests">
            {requests.length ? (
              <div className="request-list">
                {requests.map((request) => (
                  <article key={request.id}>
                    <div>
                      <b>{request.type}</b>
                      <span>
                        {request.category} · {request.createdAt}
                      </span>
                    </div>
                    <div>
                      <strong>{request.status}</strong>
                      <small>Confirmation: {request.confirmationStatus}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-box">
                <Package />
                <h2>No requests yet</h2>
                <p>
                  Order a Bag or arrange a pickup when your eligible items total
                  at least $100.
                </p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="payout">
            <div className="payout-box">
              <Wallet />
              <div>
                <h2>{balance} available</h2>
                <p>
                  Payout setup will become available after payment verification
                  is connected.
                </p>
              </div>
              <Button disabled>Set up payout</Button>
            </div>
          </TabsContent>
        </Tabs>
      </section>
      <section className="consignment-status">
        <div className="end-choice">
          <b>Unsold item preference</b>
          <button disabled>
            <HeartHandshake /> Donate
          </button>
          <button disabled>
            <RotateCcw /> Return to me
          </button>
          <small>This choice becomes available when an item is accepted.</small>
        </div>
      </section>
      <section className="mini-rules">
        <b>Quick check before sending</b>
        <span>✓ Individual listing value is normally $20+</span>
        <span>✓ Estimated collection total is $100+</span>
        <span>✓ Washed and neatly folded</span>
        <span>✓ No stains, tears or damage</span>
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
}: {
  label: string;
  icon: React.ReactNode;
  type: "bag" | "pickup";
  serviceAreas: ServiceArea[];
  pickupSlots: PickupSlot[];
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"clothing" | "electronics">(
    "clothing",
  );
  const [serviceAreaId, setServiceAreaId] = useState(serviceAreas[0]?.id ?? "");
  const availableSlots = pickupSlots.filter(
    (slot) => slot.serviceAreaId === serviceAreaId,
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={type === "bag" ? "default" : "outline"}>
          {icon}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="request-dialog">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Tell us what you want collected. We’ll review the request and
            contact you to confirm the next step.
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
                onChange={(event) =>
                  setCategory(event.target.value as "clothing" | "electronics")
                }
              >
                <option value="clothing">Clothing, shoes or accessories</option>
                <option value="electronics">Electronics</option>
              </select>
            </label>
            <label>
              Pickup city
              <select
                name="service_area_id"
                value={serviceAreaId}
                onChange={(event) => setServiceAreaId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select a city
                </option>
                {serviceAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.city}
                    {area.pickupMode === "free"
                      ? " — Free pickup"
                      : " — Subject to review"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Available pickup time
              <select name="pickup_slot_id" required defaultValue="">
                <option value="" disabled>
                  Select an available time
                </option>
                {availableSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label} · {slot.remaining} spots left
                  </option>
                ))}
              </select>
            </label>
            {!availableSlots.length ? (
              <p className="slot-note">
                No pickup times are currently open for this city. Please check
                again after new times are added.
              </p>
            ) : null}
            <div className="hold-card">
              <Truck />
              <div>
                <b>Free pickup — no deposit or card hold</b>
                <p>
                  Eligible pickups have no upfront fee. We’ll ask you to confirm
                  before adding the pickup to the driver’s route.
                </p>
              </div>
            </div>
            <label>
              Collection address
              <Input
                name="address"
                required
                minLength={10}
                maxLength={500}
                autoComplete="street-address"
                placeholder="Street address, city, postal code"
              />
            </label>
            <label>
              Approximate number of items
              <Input
                name="item_count"
                required
                type="number"
                min="1"
                max="500"
                step="1"
                inputMode="numeric"
                placeholder="For example: 12"
              />
            </label>
            <label>
              Brands (optional)
              <Input
                name="brands"
                maxLength={500}
                placeholder="For example: Aritzia, Nike, Levi’s"
              />
            </label>
            <label>
              Estimated total resale value
              <Input
                name="estimated_value"
                required
                type="number"
                min="100"
                max="1000000"
                step="1"
                inputMode="decimal"
                placeholder="$100 minimum"
              />
            </label>
            <div className="terms-box">
              <b>Required terms for {category}</b>
              {category === "clothing" ? (
                <>
                  <p>
                    • Individual listings normally require an approved value of
                    at least $20. Lower-value items may be combined into a
                    bundle.
                  </p>
                  <p>
                    • Eligible collections must total at least $100. Items must
                    be washed, folded and free of stains, tears, holes or
                    missing parts.
                  </p>
                  <p>
                    • Accepted clothing is listed for up to 90 days. Unsold
                    items may be donated, auctioned or returned according to
                    your choice.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    • Devices must power on, function properly and be free of
                    serious physical damage.
                  </p>
                  <p>
                    • You must verify ownership. We may check identification,
                    serial numbers or IMEI.
                  </p>
                  <p>
                    • Passwords, user accounts and activation locks must be
                    removed before collection.
                  </p>
                  <p>
                    • Our technicians test the device and Rewear determines its
                    resale value.
                  </p>
                </>
              )}
              <p>• Pickup dates are determined and confirmed by Rewear.</p>
              <p>
                • Your commission is locked from the initial approved item
                price: you receive 45% at $20–$99.99, 50% at $100–$249.99, 55%
                at $250–$499.99 and 65% at $500+.
              </p>
            </div>
            <label className="check">
              <input
                name="condition_confirmed"
                value="accepted"
                required
                type="checkbox"
              />{" "}
              I confirm my {category} meets the condition, ownership and
              minimum-value requirements.
            </label>
            <label className="check">
              <input
                name="policy_accepted"
                value="accepted"
                required
                type="checkbox"
              />{" "}
              I accept the selling period and commission rates.
            </label>
            <label className="check">
              <input
                name="pickup_policy_accepted"
                value="accepted"
                required
                type="checkbox"
              />{" "}
              <span>
                I accept the{" "}
                <Link href="/pickup-policy" target="_blank">
                  Pickup &amp; Missed Pickup Policy
                </Link>
                .
              </span>
            </label>
          </div>
          <div className="request-form-footer">
            <Button type="submit" disabled={!availableSlots.length}>
              Submit collection request
            </Button>
            <small className="payment-note">
              Submitting a request does not guarantee free pickup approval.
            </small>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
