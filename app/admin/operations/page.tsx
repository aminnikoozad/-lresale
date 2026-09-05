import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { createPickupSlot, togglePickupSlot, toggleServiceArea, updateReminderSettings, updateShippingSettings } from "./actions";
import "./operations.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type Area = {
  id: string;
  city: string;
  province: string;
  active: boolean;
  pickup_mode: string;
  distance_from_montreal_km: number | null;
};

type Slot = {
  id: string;
  service_area_id: string;
  window_start: string;
  window_end: string;
  capacity: number;
  booked_count: number;
  active: boolean;
};

type ReminderSettings = {
  enabled: boolean;
  first_offset_minutes: number;
  second_offset_minutes: number;
  channel: "sms" | "email" | "sms_email";
  allow_email_fallback: boolean;
};

type ShippingSettings = {
  canada_wide_enabled: boolean;
  local_center_name: string;
  local_free_radius_km: number;
  nonlocal_fee_mode: "carrier_quote" | "flat_fee";
  nonlocal_flat_fee_cents: number | null;
};

function localDateTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminOperationsPage({ searchParams }: Props) {
  const { supabase, access } = await requireAdmin();
  if (!access.can_manage_pickups && !access.can_manage_shipping) return null;

  const [{ data, error }, params] = await Promise.all([
    supabase.rpc("admin_operations_snapshot"),
    searchParams,
  ]);
  if (error || !data) throw new Error("Admin operations data could not be loaded.");

  const areas = (data.serviceAreas ?? []) as Area[];
  const slots = (data.pickupSlots ?? []) as Slot[];
  const reminders = data.reminderSettings as ReminderSettings;
  const shipping = data.shippingSettings as ShippingSettings;
  const message = typeof params.message === "string" ? params.message : null;
  const type = params.type === "error" ? "error" : "success";
  const areaById = new Map(areas.map((area) => [area.id, area.city]));

  return (
    <main className="ops-shell">
      <header className="ops-top">
        <div><span className="brand">REWEAR<span>.</span></span><b>Admin</b></div>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/items">Items</Link>
          <Link href="/admin/operations">Operations</Link>
          <Link href="/admin/settings">Selling Rules</Link>
          <Link href="/admin/security">Security</Link>
        </nav>
      </header>

      <section className="ops-wrap">
        <div className="ops-heading">
          <div>
            <p className="eyebrow dark">Admin → Operations</p>
            <h1>Pickup, delivery & reminders</h1>
            <p>Manage Montréal-area pickup availability, time slots, reminders, and Canada-wide delivery rules.</p>
          </div>
          <div className="security-chip">MFA verified · {access.role}</div>
        </div>
        {message ? <div className={`ops-message ${type}`}>{message}</div> : null}

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Pickup service areas</h2><p>Active locations cover Montréal and nearby municipalities in the 20 km pilot radius.</p></div><strong>{areas.filter((area) => area.active).length} active</strong></div>
          <div className="area-grid">
            {areas.map((area) => (
              <article key={area.id} className={area.active ? "active" : "paused"}>
                <div><b>{area.city}</b><span>{area.province} · {area.distance_from_montreal_km ?? "—"} km</span></div>
                <form action={toggleServiceArea}>
                  <input type="hidden" name="area_id" value={area.id} />
                  <input type="hidden" name="active" value={area.active ? "false" : "true"} />
                  <button type="submit">{area.active ? "Pause" : "Activate"}</button>
                </form>
              </article>
            ))}
          </div>
        </section>

        <section className="ops-card">
          <div className="ops-card-title"><div><h2>Pickup Scheduler</h2><p>Create the time windows customers can actually select.</p></div><strong>Toronto time</strong></div>
          <form action={createPickupSlot} className="slot-form">
            <label>Area<select name="service_area_id" required defaultValue=""><option value="" disabled>Select area</option>{areas.filter((a) => a.active).map((area) => <option key={area.id} value={area.id}>{area.city}</option>)}</select></label>
            <label>Start<input name="window_start" type="datetime-local" required /></label>
            <label>End<input name="window_end" type="datetime-local" required /></label>
            <label>Capacity<input name="capacity" type="number" min="1" max="100" defaultValue="4" required /></label>
            <button type="submit">Add pickup time</button>
          </form>
          <div className="slot-list">
            {slots.length ? slots.map((slot) => (
              <article key={slot.id}>
                <div><b>{areaById.get(slot.service_area_id) ?? "Area"}</b><span>{localDateTime(slot.window_start)} → {localDateTime(slot.window_end)}</span></div>
                <div><span>{slot.booked_count}/{slot.capacity} booked</span><form action={togglePickupSlot}><input type="hidden" name="slot_id" value={slot.id} /><input type="hidden" name="active" value={slot.active ? "false" : "true"} /><button type="submit">{slot.active ? "Pause" : "Activate"}</button></form></div>
              </article>
            )) : <p className="empty">No pickup times yet. Add your first slot above.</p>}
          </div>
        </section>

        <section className="ops-card two-col">
          <div>
            <div className="ops-card-title"><div><h2>Pickup reminders</h2><p>Default: confirmation/reminder 24 hours before, then another reminder 3 hours before pickup.</p></div></div>
            <form action={updateReminderSettings} className="settings-form">
              <label className="check"><input name="enabled" type="checkbox" defaultChecked={reminders.enabled} /> Enable reminder queue</label>
              <label>First reminder (hours before)<input name="first_hours" type="number" min="1" max="168" step="1" defaultValue={reminders.first_offset_minutes / 60} /></label>
              <label>Second reminder (hours before)<input name="second_hours" type="number" min="1" max="168" step="1" defaultValue={reminders.second_offset_minutes / 60} /></label>
              <label>Channel<select name="channel" defaultValue={reminders.channel}><option value="sms">SMS</option><option value="email">Email</option><option value="sms_email">SMS + Email</option></select></label>
              <label className="check"><input name="email_fallback" type="checkbox" defaultChecked={reminders.allow_email_fallback} /> Email fallback if SMS cannot be delivered</label>
              <button type="submit">Save reminder settings</button>
            </form>
            <p className="integration-note">The scheduling and confirmation queue is active. SMS delivery starts once an SMS provider credential is connected.</p>
          </div>

          <div>
            <div className="ops-card-title"><div><h2>Canada-wide shopping delivery</h2><p>Shopping is open across Canada. Local delivery is free inside the configured Montréal radius.</p></div></div>
            <form action={updateShippingSettings} className="settings-form">
              <label>Free local radius (km)<input name="radius_km" type="number" min="1" max="200" step="0.1" defaultValue={shipping.local_free_radius_km} /></label>
              <label>Outside local radius<select name="fee_mode" defaultValue={shipping.nonlocal_fee_mode}><option value="carrier_quote">Carrier-calculated shipping fee</option><option value="flat_fee">Flat shipping fee</option></select></label>
              <label>Flat fee (CAD, only when selected)<input name="flat_fee" type="number" min="0" step="0.01" defaultValue={shipping.nonlocal_flat_fee_cents == null ? "" : shipping.nonlocal_flat_fee_cents / 100} /></label>
              <button type="submit">Save delivery rules</button>
            </form>
            <p className="integration-note">Canada-wide purchasing is enabled. Checkout must use these settings when the payment/order flow is activated.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
