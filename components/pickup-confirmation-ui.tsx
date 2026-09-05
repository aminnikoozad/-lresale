"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Pickup = {
  id: string;
  scheduled_window_start: string | null;
  scheduled_window_end: string | null;
  confirmation_status: string;
  status: string;
};

function when(start: string | null, end: string | null) {
  if (!start) return "Pickup time pending";
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time.format(new Date(start))}${end ? `–${time.format(new Date(end))}` : ""}`;
}

export function PickupConfirmationUi() {
  const pathname = usePathname();
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!pathname.startsWith("/account")) return;
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("collection_requests")
        .select("id,scheduled_window_start,scheduled_window_end,confirmation_status,status")
        .eq("confirmation_status", "pending")
        .not("status", "in", "(cancelled,completed,collected)")
        .order("scheduled_window_start", { ascending: true });
      setPickups((data ?? []) as Pickup[]);
    })();
  }, [pathname]);

  async function act(id: string, action: "confirm" | "cancel") {
    setBusy(id);
    setMessage("");
    const supabase = createClient();
    const rpc = action === "confirm" ? "confirm_own_pickup" : "cancel_own_pickup";
    const { error } = await supabase.rpc(rpc, { p_request_id: id });
    if (error) {
      setMessage("We could not update this pickup. Refresh and try again.");
      setBusy(null);
      return;
    }
    setPickups((current) => current.filter((pickup) => pickup.id !== id));
    setMessage(action === "confirm" ? "Pickup confirmed." : "Pickup cancelled.");
    setBusy(null);
  }

  if (!pathname.startsWith("/account") || (!pickups.length && !message)) return null;

  return (
    <aside className="pickup-confirmation-panel" aria-live="polite">
      {message ? <div className="pickup-confirmation-message">{message}</div> : null}
      {pickups.map((pickup) => (
        <article key={pickup.id}>
          <div>
            <b>Confirm your pickup</b>
            <span>{when(pickup.scheduled_window_start, pickup.scheduled_window_end)}</span>
          </div>
          <div className="pickup-confirmation-actions">
            <button disabled={busy === pickup.id} onClick={() => act(pickup.id, "confirm")}>Confirm</button>
            <button disabled={busy === pickup.id} className="secondary" onClick={() => act(pickup.id, "cancel")}>Cancel</button>
          </div>
        </article>
      ))}
    </aside>
  );
}
