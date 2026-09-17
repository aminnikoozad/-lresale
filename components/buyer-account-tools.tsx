"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Heart, PackageCheck, RotateCcw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Favorite = { item_id: string; notify_price_drop: boolean; created_at: string };
type Alert = { id: string; item_id: string; old_price_cents: number; new_price_cents: number; created_at: string; read_at: string | null };
type Order = { id: string; status: string; payment_status: string; subtotal_cents: number; shipping_cents: number | null; total_cents: number | null; tracking_number: string | null; created_at: string };
type OrderItem = { id: string; order_id: string; item_id: string; item_name: string; brand: string; size: string | null; item_condition: string | null; unit_price_cents: number };
type ReturnRequest = { id: string; order_id: string; order_item_id: string; reason: string; status: string; created_at: string };
type CatalogItem = { item_id: string; name: string; brand: string; photo_url: string | null; price_cents: number };

function cad(cents: number | null) {
  if (cents == null) return "Pending";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}
function date(value: string) { return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(new Date(value)); }
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase()); }

export function BuyerAccountTools() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [favResult, alertResult, orderResult, catalogResult] = await Promise.all([
      supabase.from("favorites").select("item_id,notify_price_drop,created_at").order("created_at", { ascending: false }),
      supabase.from("price_drop_alerts").select("id,item_id,old_price_cents,new_price_cents,created_at,read_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("orders").select("id,status,payment_status,subtotal_cents,shipping_cents,total_cents,tracking_number,created_at").order("created_at", { ascending: false }).limit(50),
      supabase.rpc("catalog_items"),
    ]);
    const nextOrders = (orderResult.data ?? []) as Order[];
    const orderIds = nextOrders.map((order) => order.id);
    const [itemsResult, returnsResult] = orderIds.length ? await Promise.all([
      supabase.from("order_items").select("id,order_id,item_id,item_name,brand,size,item_condition,unit_price_cents").in("order_id", orderIds),
      supabase.from("return_requests").select("id,order_id,order_item_id,reason,status,created_at").in("order_id", orderIds).order("created_at", { ascending: false }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    const firstError = favResult.error || alertResult.error || orderResult.error || catalogResult.error || itemsResult.error || returnsResult.error;
    if (firstError) console.error("[account buyer] load failed", { code: firstError.code, message: firstError.message });
    setFavorites((favResult.data ?? []) as Favorite[]);
    setAlerts((alertResult.data ?? []) as Alert[]);
    setOrders(nextOrders);
    setOrderItems((itemsResult.data ?? []) as OrderItem[]);
    setReturns((returnsResult.data ?? []) as ReturnRequest[]);
    setCatalog((catalogResult.data ?? []) as CatalogItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(false); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const catalogMap = useMemo(() => new Map(catalog.map((item) => [item.item_id, item])), [catalog]);
  const unread = alerts.filter((alert) => !alert.read_at).length;

  const markAlertsRead = async () => {
    const supabase = createClient();
    const ids = alerts.filter((alert) => !alert.read_at).map((alert) => alert.id);
    if (!ids.length) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("price_drop_alerts").update({ read_at: readAt }).in("id", ids);
    if (!error) setAlerts((current) => current.map((alert) => ids.includes(alert.id) ? { ...alert, read_at: readAt } : alert));
  };

  const removeFavorite = async (itemId: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("item_id", itemId);
    if (!error) setFavorites((current) => current.filter((favorite) => favorite.item_id !== itemId));
  };

  const requestReturn = async (order: Order, item: OrderItem, formData: FormData) => {
    setMessage(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const reason = String(formData.get("reason") || "");
    const details = String(formData.get("details") || "").trim();
    const { error } = await supabase.from("return_requests").insert({
      buyer_id: user.id,
      order_id: order.id,
      order_item_id: item.id,
      reason,
      details: details || null,
    });
    if (error) {
      setMessage("This return request could not be submitted. Returns can only be requested for eligible paid and delivered orders.");
      return;
    }
    setMessage("Return / claim request submitted for review.");
    await load();
  };

  return (
    <section className="buyer-tools dashboard">
      <div className="buyer-tools-heading"><div><p className="eyebrow dark">Buyer account</p><h2>Saved items, alerts and purchases</h2></div>{unread > 0 ? <Button type="button" variant="outline" onClick={markAlertsRead}><Bell /> Mark {unread} read</Button> : null}</div>
      {message ? <div className="success-banner">{message}</div> : null}
      {loading ? <div className="empty-box"><p>Loading buyer account…</p></div> : (
        <div className="buyer-tools-grid">
          <section className="buyer-panel">
            <h3><Heart /> Favorites</h3>
            {favorites.length ? favorites.map((favorite) => {
              const item = catalogMap.get(favorite.item_id);
              return <article className="buyer-row" key={favorite.item_id}><div><Link href={`/item/${favorite.item_id}`}><b>{item?.name || "Saved item"}</b></Link><span>{item ? `${item.brand} · ${cad(item.price_cents)}` : "This item is no longer publicly listed."}</span></div><button type="button" onClick={() => removeFavorite(favorite.item_id)}>Remove</button></article>;
            }) : <p className="buyer-empty">Items you save with the heart button will appear here.</p>}
          </section>
          <section className="buyer-panel">
            <h3><Bell /> Price-drop alerts</h3>
            {alerts.length ? alerts.map((alert) => <article className={`buyer-row ${alert.read_at ? "" : "unread"}`} key={alert.id}><div><Link href={`/item/${alert.item_id}`}><b>{catalogMap.get(alert.item_id)?.name || "Saved item"}</b></Link><span>{cad(alert.old_price_cents)} → <strong>{cad(alert.new_price_cents)}</strong> · {date(alert.created_at)}</span></div></article>) : <p className="buyer-empty">Price drops for saved items will appear here automatically.</p>}
          </section>
          <section className="buyer-panel purchases-panel">
            <h3><PackageCheck /> My Purchases</h3>
            {orders.length ? orders.map((order) => {
              const items = orderItems.filter((item) => item.order_id === order.id);
              return <article className="purchase-card" key={order.id}><header><div><b>Order {order.id.slice(0, 8).toUpperCase()}</b><span>{date(order.created_at)}</span></div><div><strong>{title(order.status)}</strong><small>Payment: {title(order.payment_status)}</small></div></header>{items.map((item) => {
                const existingReturn = returns.find((entry) => entry.order_item_id === item.id);
                const eligible = order.status === "delivered" && order.payment_status === "paid" && !existingReturn;
                return <div className="purchase-item" key={item.id}><div><Link href={`/item/${item.item_id}`}><b>{item.brand} · {item.item_name}</b></Link><span>{item.size ? `Size ${item.size} · ` : ""}{cad(item.unit_price_cents)}</span></div>{existingReturn ? <span className="return-status"><RotateCcw /> Return: {title(existingReturn.status)}</span> : eligible ? <form className="return-form" action={(data) => requestReturn(order, item, data)}><select name="reason" required defaultValue=""><option value="" disabled>Return / claim reason</option><option value="not_as_described">Not as described</option><option value="damaged">Damaged</option><option value="wrong_item">Wrong item</option><option value="fit_or_preference">Fit / preference</option><option value="other">Other</option></select><input name="details" maxLength={2000} placeholder="Details (optional)" /><Button type="submit" size="sm" variant="outline">Request review</Button></form> : null}</div>;
              })}<footer><span>Subtotal {cad(order.subtotal_cents)}</span>{order.tracking_number ? <span><Truck /> Tracking {order.tracking_number}</span> : null}</footer></article>;
            }) : <p className="buyer-empty">Your purchases will appear here after checkout.</p>}
          </section>
        </div>
      )}
    </section>
  );
}
