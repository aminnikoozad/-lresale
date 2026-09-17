"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, LockKeyhole, ShoppingBag, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart-store";

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export default function CartPage() {
  const { items, remove, clear } = useCart();
  const subtotal = items.reduce((sum, item) => sum + item.priceCents, 0);
  const checkoutHref = items.length ? `/checkout?items=${encodeURIComponent(items.map((item) => item.id).join(","))}` : "#";

  return (
    <main className="cart-page section-wrap">
      <header className="cart-header">
        <Link href="/#shop"><ArrowLeft /> Continue shopping</Link>
        <h1><ShoppingBag /> Your bag</h1>
      </header>

      <div className="checkout-progress" aria-label="Checkout progress">
        <div className="active"><span>1</span><b>Bag</b></div>
        <div><span>2</span><b>Delivery</b></div>
        <div><span>3</span><b>Payment</b></div>
        <div><span>4</span><b>Confirmation</b></div>
      </div>

      {!items.length ? (
        <section className="cart-empty">
          <ShoppingBag />
          <h2>Your bag is empty</h2>
          <p>Each secondhand item is unique. Save the pieces you want before they’re gone.</p>
          <Button asChild><Link href="/#shop">Browse available items</Link></Button>
        </section>
      ) : (
        <div className="cart-layout">
          <section className="cart-items">
            <div className="cart-one-of-one-note">
              <Check />
              <div><b>Unique inventory</b><span>Every item has a quantity of one. Final availability is verified again at checkout.</span></div>
            </div>
            {items.map((item) => (
              <article className="cart-item" key={item.id}>
                <Link href={`/item/${item.id}`} className="cart-thumb"><Image src={item.photoUrl} alt={`${item.brand} ${item.name}`} fill sizes="120px" /></Link>
                <div className="cart-item-copy">
                  <small>{item.brand}</small>
                  <Link href={`/item/${item.id}`}><h2>{item.name}</h2></Link>
                  <span>{item.size ? `Size ${item.size}` : item.condition || "Inspected item"}</span>
                  <b>{cad(item.priceCents)}</b>
                </div>
                <button type="button" className="cart-remove" onClick={() => remove(item.id)} aria-label={`Remove ${item.name} from bag`}><Trash2 /></button>
              </article>
            ))}
            <button type="button" className="cart-clear" onClick={clear}>Clear bag</button>
          </section>

          <aside className="cart-summary">
            <h2>Order summary</h2>
            <div><span>{items.length} {items.length === 1 ? "item" : "items"}</span><b>{cad(subtotal)}</b></div>
            <div><span>Shipping</span><span>Confirmed before payment</span></div>
            <div><span>Taxes</span><span>Calculated when payment is activated</span></div>
            <div className="cart-total"><span>Subtotal</span><strong>{cad(subtotal)}</strong></div>
            <Button asChild size="lg"><Link href={checkoutHref}>Continue to delivery</Link></Button>
            <div className="cart-readiness-list">
              <span><LockKeyhole /> Server-side price & availability check</span>
              <span><Truck /> Delivery details collected before payment</span>
            </div>
            <small>No card is charged on the current checkout flow. Payment will be activated only through a secure payment provider.</small>
          </aside>
        </div>
      )}
    </main>
  );
}
