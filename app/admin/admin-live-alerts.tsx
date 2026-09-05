"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PickupInsert = {
  id?: string;
  user_id?: string;
  category?: string;
  item_count?: number | null;
  priority_pickup?: boolean;
};

type Alert = {
  id: string;
  title: string;
  body: string;
};

export function AdminLiveAlerts() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [alert, setAlert] = useState<Alert | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
      void navigator.serviceWorker.register("/admin-sw.js", { scope: "/" }).catch(() => undefined);
    }

    const supabase = createClient();
    const channel = supabase
      .channel("admin-pickup-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "collection_requests" },
        async (payload) => {
          const request = (payload.new ?? {}) as PickupInsert;
          const itemText = request.item_count ? `${request.item_count} item${request.item_count === 1 ? "" : "s"}` : "New items";
          const category = request.category ? request.category.replaceAll("_", " ") : "pickup";
          const notification: Alert = {
            id: request.id || crypto.randomUUID(),
            title: request.priority_pickup ? "New priority pickup request" : "New pickup request",
            body: `${itemText} · ${category}. Open the Pickup Inbox to review the customer and request.`,
          };
          setAlert(notification);

          if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
            try {
              const registration = await navigator.serviceWorker.ready;
              await registration.showNotification(notification.title, {
                body: notification.body,
                icon: "/favicon.svg",
                badge: "/favicon.svg",
                tag: `pickup-${notification.id}`,
                data: { url: "/admin/operations#pickup-requests" },
              });
            } catch {
              // The in-dashboard alert remains available even when the browser blocks device notifications.
            }
          }
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function enableNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    try {
      await navigator.serviceWorker.register("/admin-sw.js", { scope: "/" });
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      setPermission("unsupported");
    }
  }

  return (
    <>
      <section className="ops-card admin-alert-card" aria-label="Admin pickup notifications">
        <div className="ops-card-title">
          <div>
            <h2>Pickup alerts</h2>
            <p>Live alerts are connected to new pickup requests while this Admin session is open.</p>
          </div>
          <strong>{connected ? "Live" : "Connecting…"}</strong>
        </div>
        <div className="admin-alert-controls">
          {permission === "granted" ? (
            <span className="alert-enabled"><BellRing /> Device notifications enabled</span>
          ) : permission === "denied" ? (
            <span>Notifications are blocked in this browser. Enable them in your browser/site settings.</span>
          ) : permission === "unsupported" ? (
            <span>This browser does not expose web notification permission here. In-dashboard alerts still work.</span>
          ) : (
            <button type="button" onClick={enableNotifications}><Bell /> Enable notifications on this device</button>
          )}
          <Link href="/admin/operations#pickup-requests">Open Pickup Inbox</Link>
        </div>
        <p className="integration-note">
          For iPhone background alerts when the Admin site is completely closed, Rewear will need a dedicated Web Push provider/VAPID connection. No private push key is stored in the browser or repository.
        </p>
      </section>

      {alert ? (
        <div className="admin-live-toast" role="status" aria-live="polite">
          <div><BellRing /><strong>{alert.title}</strong></div>
          <p>{alert.body}</p>
          <div>
            <Link href="/admin/operations#pickup-requests">Review request</Link>
            <button type="button" aria-label="Dismiss alert" onClick={() => setAlert(null)}><X /></button>
          </div>
        </div>
      ) : null}
    </>
  );
}
