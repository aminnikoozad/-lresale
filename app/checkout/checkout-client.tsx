"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, LockKeyhole, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/components/cart-store";

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export function CheckoutClient({ itemIds }: { itemIds: string[] }) {
  const router = useRouter();
  const { items } = useCart();
  const checkoutItems = useMemo(() => items.filter((item) => itemIds.includes(item.id)), [items, itemIds]);
  const subtotal = checkoutItems.reduce((sum, item) => sum + item.priceCents, 0);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));
    };
    void check();
  }, []);

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
      const { data, error: rpcError } = await supabase.rpc("create_checkout_order", {
        item_ids: itemIds,
        recipient_name: String(formData.get("recipient_name") || ""),
        address_line1: String(formData.get("address_line1") || ""),
        address_line2: String(formData.get("address_line2") || ""),
        city: String(formData.get("city") || ""),
        province: String(formData.get("province") || "QC"),
        postal_code: String(formData.get("postal_code") || ""),
      });
      if (rpcError) throw rpcError;
      setOrderId(String(data));
    } catch (cause) {
      console.error("[checkout] order creation failed", cause);
      setError("We couldn’t prepare this order. One of the items may no longer be available. Refresh your bag and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!checkoutItems.length) return <section className="cart-empty"><h1>Your checkout is empty</h1><p>Return to your bag and choose at least one available item.</p><Button asChild><Link href="/cart">Back to bag</Link></Button></section>;

  if (orderId) return (
    <section className="checkout-result">
      <LockKeyhole />
      <h1>Order prepared</h1>
      <p>Your order reference is <strong>{orderId.slice(0, 8).toUpperCase()}</strong>.</p>
      <div className="payment-pending"><CreditCard /><div><b>Payment is not enabled yet</b><span>No charge has been made and the order is not marked paid. Stripe must be connected before secure payment can be activated.</span></div></div>
      <Button asChild><Link href="/account/purchases">View My Purchases</Link></Button>
    </section>
  );

  return (
    <div className="checkout-layout">
      <form action={submit} className="checkout-form">
        <div className="checkout-title"><MapPin /><div><p className="eyebrow dark">Secure checkout</p><h1>Delivery details</h1></div></div>
        {authenticated === false ? <div className="checkout-login-note">You’ll be asked to sign in before the order can be prepared.</div> : null}
        {error ? <div className="checkout-error">{error}</div> : null}
        <label>Recipient name<Input name="recipient_name" minLength={2} maxLength={120} required autoComplete="name" /></label>
        <label>Address<Input name="address_line1" minLength={5} maxLength={200} required autoComplete="address-line1" /></label>
        <label>Apartment / unit (optional)<Input name="address_line2" maxLength={120} autoComplete="address-line2" /></label>
        <div className="checkout-grid"><label>City<Input name="city" minLength={2} maxLength={100} required autoComplete="address-level2" /></label><label>Province<Input name="province" defaultValue="QC" minLength={2} maxLength={50} required autoComplete="address-level1" /></label></div>
        <label>Postal code<Input name="postal_code" minLength={3} maxLength={20} required autoComplete="postal-code" /></label>
        <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Checking availability…" : "Prepare order"}</Button>
        <small>Preparing an order does not charge your card. Payment will only be enabled through a connected secure payment provider.</small>
      </form>
      <aside className="checkout-summary"><h2>Your items</h2>{checkoutItems.map((item) => <div className="checkout-line" key={item.id}><span><b>{item.brand}</b>{item.name}</span><strong>{cad(item.priceCents)}</strong></div>)}<div className="cart-total"><span>Subtotal</span><strong>{cad(subtotal)}</strong></div><p>Shipping is confirmed before payment based on the delivery address.</p></aside>
    </div>
  );
}
