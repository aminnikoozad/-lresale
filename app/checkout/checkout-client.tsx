"use client";
import { checkoutLoginHref } from "@/lib/buyer-flow-navigation";
import { BuyerViewEvent } from "@/components/buyer-view-event";
import { useCartQuote } from "@/components/use-cart-quote";
import { FirstPurchaseOffer } from "@/components/first-purchase-offer";
import { Localize } from "@/components/site-language";


import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const {quote, error:quoteError} = useCartQuote(itemIds);
  const currentItems = quote?.items ?? [];
  const subtotal = currentItems.reduce((sum,item)=>sum+item.priceCents,0);
  const quoteReady = Boolean(quote && !quote.unavailable.length && currentItems.length === itemIds.length);
  const [discountCode,setDiscountCode] = useState("");
  const [discountCents,setDiscountCents] = useState(0);
  const onOfferChange = useCallback((code:string,cents:number)=>{setDiscountCode(code);setDiscountCents(cents);},[]);

  const [authenticated, setAuthenticated] = useState<boolean | null>(initialDelivery ? true : null);
  const [destination, setDestination] = useState(initialDelivery?.postalCode ?? "");
  const [postalSelection, setPostalSelection] = useState<PostalSelection | null>(null);
  const [savedShipping, setSavedShipping] = useState<PostalSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
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
      if (!quoteReady) throw new Error("Current cart verification required");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(checkoutLoginHref(itemIds));
        return;
      }

      if (formData.get("buyer_terms_accepted") !== "accepted") {
        throw new Error("Buyer terms were not accepted");
      }

      if (postalSelection && (postalSelection.postalCode !== postalCode(String(formData.get("postal_code") || "")) || Date.parse(postalSelection.expiresAt) <= Date.now())) throw new Error("Postal quote expired");
      const { data, error: rpcError } = await supabase.rpc(discountCode ? "prepare_buyer_checkout" : "prepare_checkout_with_terms", {
        ...(discountCode ? {p_discount_code:discountCode} : {}),
        p_items: postalSelection ? null : itemIds,
        p_quote: postalSelection?.quoteId ?? null,
        p_service: postalSelection?.serviceCode ?? null,
        p_recipient_name: String(formData.get("recipient_name") || ""),
        p_address_line1: String(formData.get("address_line1") || ""),
        p_address_line2: String(formData.get("address_line2") || ""),
        p_city: String(formData.get("city") || ""),
        p_province: String(formData.get("province") || "QC"),
        p_postal_code: String(formData.get("postal_code") || ""),
        p_terms_version: BUYER_TERMS_VERSION,
        p_return_policy_version: RETURN_POLICY_VERSION,
        p_privacy_notice_version: PRIVACY_NOTICE_VERSION,
      });
      if (rpcError) throw rpcError;

      const preparedOrderId = String(data || "");
      if (!/^[0-9a-f-]{36}$/i.test(preparedOrderId)) throw new Error("Invalid prepared order");

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
    return <Localize>{(
      <section className="cart-empty">
        <h1>Your checkout is empty</h1>
        <p>Return to your bag and choose at least one available item.</p>
        <Button asChild><Link href="/cart">Back to bag</Link></Button>
      </section>
    )}</Localize>;
  }

  if (orderId) {
    return <Localize>{(
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
            <b>Payment isn’t available yet</b>
            <span>You haven’t been charged. Your order is waiting for payment, which isn’t available yet.</span>
          </div>
        </div>
        <div className="checkout-readiness-card">
          <ShieldCheck />
          <div><b>Your saved order</b><span>Your items, checked prices, delivery details and accepted terms are saved with your order.</span></div>
        </div>
        <Button asChild><Link href="/account/buyer">View My Purchases</Link></Button>
      </section>
    )}</Localize>;
  }

  return <Localize>{(
    <div className="checkout-page-shell">
      {quoteReady ? <BuyerViewEvent name="begin_checkout" ids={itemIds} /> : null}
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

          <p className="checkout-intro">Enter your delivery address to calculate shipping and taxes. Payment isn’t available yet.</p>
          {initialDelivery ? <div className="checkout-prefill-note"><Check /> We prefilled the delivery details saved in your Shikimomo profile. Review them before continuing.</div> : null}
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
          {!postalSelection ? <p>Choose a delivery service to confirm shipping. Otherwise, we’ll save your address for review.</p> : null}

          <FirstPurchaseOffer itemIds={itemIds} onChange={onOfferChange} />
          <div className="checkout-field-section">
            <h2>Policies</h2>
            <label className="checkout-policy-consent">
              <input type="checkbox" name="buyer_terms_accepted" value="accepted" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} required />
              <span>I accept the <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms of Use</Link> and <Link href="/returns" target="_blank" rel="noopener noreferrer">Returns & Refunds Policy</Link>, and acknowledge the <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.</span>
            </label>
            <small>Your accepted terms are saved with your order. You’ll review the full total, including taxes and delivery, before paying.</small>
          </div>

          <div className="checkout-next-step-preview">
            <CreditCard />
            <div><b>Next: Payment</b><span>Payment isn’t available yet. You won’t be charged at this step.</span></div>
          </div>

          <Button type="submit" size="lg" disabled={submitting || !quoteReady || !termsAccepted}>{submitting ? "Checking availability…" : "Save delivery & prepare payment"}</Button>
          <small>Saving your order won’t charge your card. We’ll check prices and availability again.</small>
        </form>

        <aside className="checkout-summary">
          <h2>Your items</h2>
          {currentItems.map((item) => (
            <div className="checkout-line" key={item.id}>
              <span><b>{item.brand}</b>{item.name}</span>
              <strong>{cad(item.priceCents)}</strong>
            </div>
          ))}
          {!quoteReady ? <p role="alert">{quoteError ? "We could not verify your bag. Try again before continuing." : "Checking current prices and availability…"}</p> : null}
          {quote?.unavailable.length ? <p role="alert">An item is no longer available. Return to your bag to review it.</p> : null}
          <div className="checkout-summary-row"><span>Discount</span><span>{cad(discountCents)}</span></div>
          <div className="checkout-summary-row"><span>Shipping</span><span>{postalSelection ? cad(postalSelection.totalCents) : "Not yet confirmed"}</span></div>
          <div className="checkout-summary-row"><span>Taxes</span><span>Calculated before payment</span></div>
          <div className="cart-total"><span>Subtotal</span><strong>{quote ? cad(subtotal-discountCents) : "—"}</strong></div>
          <div className="checkout-assurance-list">
            <span><ShieldCheck /> Inspected inventory</span>
            <span><LockKeyhole /> Price checked</span>
            <span><Truck /> Canada delivery details captured</span>
          </div>
          <p>Postal quotes include shipping taxes. Item taxes and the final payable total are confirmed separately before payment.</p>
        </aside>
      </div>
    </div>
  )}</Localize>;
}
