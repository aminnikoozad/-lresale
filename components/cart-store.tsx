"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  id: string;
  name: string;
  brand: string;
  priceCents: number;
  photoUrl: string;
  size: string | null;
  condition: string | null;
};

type CartContextValue = {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
};

const STORAGE_KEY = "rewear-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);

function sanitize(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, CartItem>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Partial<CartItem>;
    if (
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.brand !== "string" ||
      typeof item.photoUrl !== "string" ||
      !Number.isInteger(item.priceCents) ||
      Number(item.priceCents) <= 0
    ) continue;
    unique.set(item.id, {
      id: item.id,
      name: item.name.slice(0, 200),
      brand: item.brand.slice(0, 120),
      photoUrl: item.photoUrl,
      priceCents: Number(item.priceCents),
      size: typeof item.size === "string" ? item.size.slice(0, 80) : null,
      condition: typeof item.condition === "string" ? item.condition.slice(0, 80) : null,
    });
  }
  return [...unique.values()].slice(0, 25);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let restored: CartItem[] = [];
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        restored = raw ? sanitize(JSON.parse(raw)) : [];
      } catch {
        restored = [];
      }
      setItems(restored);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const add = useCallback((item: CartItem) => {
    setItems((current) => current.some((entry) => entry.id === item.id) ? current : [...current, item].slice(0, 25));
  }, []);
  const remove = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);
  const has = useCallback((id: string) => items.some((item) => item.id === id), [items]);
  const value = useMemo(() => ({ items, add, remove, clear, has }), [items, add, remove, clear, has]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used within CartProvider");
  return value;
}

export function CartNavLink() {
  const { items } = useCart();
  return (
    <Link href="/cart" className="cart-nav-link" aria-label={`Shopping bag with ${items.length} items`}>
      <ShoppingBag />
      <span>Bag</span>
      {items.length > 0 ? <b>{items.length}</b> : null}
    </Link>
  );
}
