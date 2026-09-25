"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, LockKeyhole, MapPin, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { PostalEstimator, type PostalSelection } from "@/components/postal-estimator";
import { postalCode } from "@/lib/postal";
import { useCart } from "@/components/cart-store";
import { BUYER_TERMS_VERSION, PRIVACY_NOTICE_VERSION, RETURN_POLICY_VERSION } from "@/lib/legal-versions";

export type CheckoutDeliveryDefaults = {
  recipientName: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
};

type CheckoutClientProps = {
  itemIds: string[];
  initialDelivery?: CheckoutDeliveryDefaults | null;
};

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export function CheckoutClient({ itemIds, initialDelivery = null }: CheckoutClientProps) {
  const router = useRouter();
  const { items } = useCart();
  const checkoutItems = useMemo(() => items.filter((item) => itemIds.includes(item.id)), [items, itemIds]);
  const subtotal = checkoutItems.reduce((sum, item) => sum + item.priceCents, 0);
  const [authenticated, setAuthenticated] = useState<boolean | null>(initialDelivery ? true : null);
  const [destination, setDestination] = useState(initialDelivery?.postalCode ?? "");
  const [postalSelection, setPostalSelection] = useState<PostalSelection | null>(null);
  const [savedShipping, setSavedShipping] = useState<PostalSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authenticated === true) return;
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));
    };
    void check();
  }, [authenticated]);

  const submit = async (formData: FormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      if (formData.get("buyer_terms_accepted") !== "accepted") {
        throw new Error("Buyer terms were not accepted");
      }

      if (postalSelection && (postalSelection.postalCode !== postalCode(String(formData.get("postal_code") || "")) || Date.parse(postalSelection.expiresAt) <= Date.now())) throw new Error("Postal quote expired");
      const { data, error: rpcError } = await supabase.rpc(postalSelection ? "create_postal_checkout" : "create_checkout_order", {
        ...(postalSelection ? { p_quote: postalSelection.quoteId, p_service: postalSelection.serviceCode } : { item_ids: itemIds }),
        recipient_name: String(formData.get("recipient_name") || ""),
        address_line1: String(formData.get("address_line1") || ""),
        address_line2: String(formData.get("address_line2") || ""),
        city: String(formData.get("city") || ""),
        province: String(formData.get("province") || "QC"),
        postal_code: String(formData.get("postal_code") || ""),
      });
      if (rpcError) throw rpcError;

      const preparedOrderId = String(data || "");
      if (!/^[0-9a-f-]{36}$/i.test(preparedOrderId)) throw new Error("Invalid prepared order");

      const { error: acceptanceError } = await supabase.rpc("accept_checkout_terms", {
        p_order: preparedOrderId,
        p_terms_version: BUYER_TERMS_VERSION,
        p_return_policy_version: RETURN_POLICY_VERSION,
        p_privacy_notice_version: PRIVACY_NOTICE_VERSION,
      });
      if (acceptanceError) throw acceptanceError;

      setSavedShipping(postalSelection);
      setOrderId(preparedOrderId);
    } catch (cause) {
      console.error("[checkout] order preparation failed", cause);
      setError("We couldn’t prepare this order. Review the required policies and delivery details, recalculate shipping if needed, and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!checkoutItems.length) {
    return (
      <section className="cart-empty">
        <h1>Your checkout is empty</h1>
        <p>Return to your bag and choose at least one available item.</p>
        <Button asChild><Link href="/cart">Back to bag</Link></Button>
      </section>
    );
  }

  if (orderId) {
    return (
      <section className="checkout-result">
        <div className="checkout-progress" aria-label="Checkout progress">
          <div className="done"><span><Check /></span><b>Bag</b></div>
          <div className="done"><span><Check /></span><b>Delivery</b></div>
          <div className="active"><span>3</span><b>Payment</b></div>
          <div><span>4</span><b>Confirmation</b></div>
        </div>
        <LockKeyhole />
        <h1>Checkout details saved</h1>
        <p>Your order reference is <strong>{orderId.slice(0, 8).toUpperCase()}</strong>.</p>
        {savedShipping ? <div className="checkout-readiness-card"><Truck /><div><b>Canada Post · {savedShipping.serviceCode}</b><span>{cad(savedShipping.totalCents)} shipping, including carrier shipping taxes. Reconfirmation is required before payment.</span></div></div> : null}
        <div className="payment-pending">
          <CreditCard />
          <div>
            <b>Payment connection is the next step</b>
            <span>No charge has been made. This order remains Awaiting Payment until a secure payment provider is connected and confirms payment.</span>
          </div>
        </div>
        <div className="checkout-readiness-card">
          <ShieldCheck />
          <div><b>What is already ready</b><span>Buyer identity, selected inventory, server-verified prices, delivery details and the accepted policy versions are attached to this order.</span></div>
        </div>
        <Button asChild><Link href="/account/purchases">View My Purchases</Link></Button>
      </section>
    );
  }

  return (
    <div className="checkout-page-shell">
      <div className="checkout-progress" aria-label="Checkout progress">
        <div className="done"><span><Check /></span><b>Bag</b></div>
        <div className="active"><span>2</span><b>Delivery</b></div>
        <div><span>3</span><b>Payment</b></div>
        <div><span>4</span><b>Confirmation</b></div>
      </div>

      <div className="checkout-layout">
        <form action={submit} className="checkout-form">
          <div className="checkout-title">
            <MapPin />
            <div><p className="eyebrow dark">Secure checkout</p><h1>Delivery details</h1></div>
          </div>

          <p className="checkout-intro">Enter the address that will be used for shipping quotes, tax calculation and the final payment step once payment processing is connected.</p>
          {initialDelivery ? <div className="checkout-prefill-note"><Check /> We prefilled the delivery details saved in your REWEAR profile. Review them before continuing.</div> : null}
          {authenticated === false ? <div className="checkout-login-note">You’ll be asked to sign in before the order can be prepared.</div> : null}
          {error ? <div className="checkout-error">{error}</div> : null}

          <div className="checkout-field-section">
            <h2>Recipient</h2>
            <label>Recipient name<Input name="recipient_name" defaultValue={initialDelivery?.recipientName ?? ""} minLength={2} maxLength={120} required autoComplete="name" /></label>
          </div>

          <div className="checkout-field-section">
            <h2>Shipping address</h2>
            <label>Address<Input name="address_line1" defaultValue={initialDelivery?.addressLine1 ?? ""} minLength={5} maxLength={200} required autoComplete="address-line1" /></label>
            <label>Apartment / unit (optional)<Input name="address_line2" maxLength={120} autoComplete="address-line2" /></label>
            <div className="checkout-grid">
              <label>City<Input name="city" defaultValue={initialDelivery?.city ?? ""} minLength={2} maxLength={100} required autoComplete="address-level2" /></label>
              <label>Province<Input name="province" defaultValue={initialDelivery?.province || "QC"} minLength={2} maxLength={50} required autoComplete="address-level1" /></label>
            </div>
            <label>Postal code<Input name="postal_code" value={destination} onChange={e => {setDestination(e.target.value);setPostalSelection(null);}} minLength={3} maxLength={20} required autoComplete="postal-code" /></label>
          </div>

          <PostalEstimator itemIds={itemIds} destination={destination} onSelect={setPostalSelection}/>
          {!postalSelection ? <p>Without a selected postal service, delivery details are saved for review only; shipping remains unconfirmed.</p> : null}

          <div className="checkout-field-section">
            <h2>Policies</h2>
            <label className="checkout-policy-consent">
              <input type="checkbox" name="buyer_terms_accepted" value="accepted" required />
              <span>I have reviewed and agree to the <Link href="/terms" target="_blank">Terms of Use</Link> and <Link href="/returns" target="_blank">Returns & Refunds Policy</Link>, and I acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span>
            </label>
            <small>The policy versions and acceptance time are recorded with this prepared order. You will review the final price, tax and delivery total again before any payment is charged.</small>
          </div>

          <div className="checkout-next-step-preview">
            <CreditCard />
            <div><b>Next: Payment</b><span>Card or wallet fields will appear here after the payment provider is connected. They are intentionally disabled today.</span></div>
          </div>

          <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Checking availability…" : "Save delivery & prepare payment"}</Button>
          <small>Preparing checkout does not charge your card. The database verifies current price and availability again before creating the order.</small>
        </form>

        <aside className="checkout-summary">
          <h2>Your items</h2>
          {checkoutItems.map((item) => (
            <div className="checkout-line" key={item.id}>
              <span><b>{item.brand}</b>{item.name}</span>
              <strong>{cad(item.priceCents)}</strong>
            </div>
          ))}
          <div className="checkout-summary-row"><span>Shipping</span><span>{postalSelection ? cad(postalSelection.totalCents) : "Not yet confirmed"}</span></div>
          <div className="checkout-summary-row"><span>Taxes</span><span>Calculated before payment</span></div>
          <div className="cart-total"><span>Subtotal</span><strong>{cad(subtotal)}</strong></div>
          <div className="checkout-assurance-list">
            <span><ShieldCheck /> Inspected inventory</span>
            <span><LockKeyhole /> Server-verified price</span>
            <span><Truck /> Canada delivery details captured</span>
          </div>
          <p>Postal quotes include shipping taxes. Item taxes and the final payable total are confirmed separately before payment.</p>
        </aside>
      </div>
    </div>
  );
}
