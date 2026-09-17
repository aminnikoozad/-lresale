"use client";

import { useRouter } from "next/navigation";
import { Heart, ShoppingBag, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useCart, type CartItem } from "@/components/cart-store";

export function AddToCartButton({ item, compact = false }: { item: CartItem; compact?: boolean }) {
  const { add, has } = useCart();
  const inCart = has(item.id);
  return (
    <Button
      type="button"
      size={compact ? "icon-sm" : "default"}
      variant={inCart ? "secondary" : "default"}
      aria-label={inCart ? `${item.name} is in your bag` : `Add ${item.name} to bag`}
      onClick={() => add(item)}
    >
      {inCart ? <Check /> : <ShoppingBag />}
      {!compact ? (inCart ? "In your bag" : "Add to bag") : null}
    </Button>
  );
}

export function FavoriteButton({ itemId, compact = false }: { itemId: string; compact?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("favorites").select("item_id").eq("user_id", user.id).eq("item_id", itemId).maybeSingle();
      if (active) setSaved(Boolean(data));
    };
    void load();
    return () => { active = false; };
  }, [itemId]);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      if (saved) {
        const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("item_id", itemId);
        if (error) throw error;
        setSaved(false);
      } else {
        const { error } = await supabase.from("favorites").insert({ user_id: user.id, item_id: itemId, notify_price_drop: true });
        if (error && error.code !== "23505") throw error;
        setSaved(true);
      }
    } catch (error) {
      console.error("[storefront] favorite toggle failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size={compact ? "icon-sm" : "default"}
      variant="outline"
      aria-pressed={saved}
      aria-label={saved ? "Remove from favorites" : "Save to favorites and enable price-drop alerts"}
      disabled={loading}
      onClick={toggle}
      className={saved ? "favorite-active" : undefined}
    >
      <Heart fill={saved ? "currentColor" : "none"} />
      {!compact ? (saved ? "Saved" : "Save") : null}
    </Button>
  );
}
