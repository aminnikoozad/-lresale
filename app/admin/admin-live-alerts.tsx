"use client";
import { Localize } from "@/components/site-language";


import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { AdminPushControls } from "@/components/admin-push-controls";
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
  const [alert, setAlert] = useState<Alert | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
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

        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return <Localize>{(
    <>
      <section className="ops-card admin-alert-card" aria-label="Admin pickup notifications">
        <div className="ops-card-title">
          <div>
            <h2>Pickup alerts</h2>
            <p>Pickup and support alerts can reach registered devices even when this panel is closed.</p>
          </div>
          <strong>{connected ? "Live" : "Connecting…"}</strong>
        </div>
        <div className="admin-alert-controls">
          <AdminPushControls />
          <Link href="/admin/operations#pickup-requests">Open Pickup Inbox</Link>
        </div>
        <p className="integration-note">
          On iPhone, add Shikimomo to your Home Screen, open it there, then enable notifications.
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
  )}</Localize>;
}
