import Link from "next/link";
import { updatePickupRequestStatus } from "./actions";

export type PickupRequest = {
  id: string;
  user_id: string;
  request_type: string;
  category: string;
  address: string;
  item_count: number | null;
  brand_notes: string | null;
  estimated_resale_value_cents: number;
  pickup_fee_cents: number;
  priority_pickup: boolean;
  status: string;
  confirmation_status: string;
  scheduled_window_start: string | null;
  created_at: string;
  customer_name: string | null;
  customer_username: string | null;
  customer_code: string | null;
  area_city: string | null;
};

function localDateTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function cad(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format((cents ?? 0) / 100);
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PickupInbox({ requests, enabled }: { requests: PickupRequest[]; enabled: boolean }) {
  const newCount = requests.filter((request) => request.status === "submitted").length;

  return (
    <section className="ops-card" id="pickup-requests">
      <div className="ops-card-title">
        <div>
          <h2>Incoming pickup requests</h2>
          <p>Each request is linked to the customer account, username and permanent Rewear customer code.</p>
        </div>
        <strong>{enabled ? `${newCount} new · ${requests.length} shown` : "Setup pending"}</strong>
      </div>

      {!enabled ? (
        <p className="integration-note">The pickup inbox is ready in the app. Apply the latest database migration to start loading customer requests here.</p>
      ) : requests.length ? (
        <div className="pickup-request-list">
          {requests.map((request) => (
            <article className={`pickup-request ${request.status === "submitted" ? "is-new" : ""}`} key={request.id}>
              <div className="pickup-request-head">
                <div>
                  <div className="pickup-person-line">
                    <h3>{request.customer_name || "Customer"}</h3>
                    {request.status === "submitted" ? <span className="new-badge">NEW</span> : null}
                    {request.priority_pickup ? <span className="priority-badge">Priority</span> : null}
                  </div>
                  <p>@{request.customer_username || "user"} · <b>{request.customer_code || "No customer code"}</b></p>
                </div>
                <span className="request-status">{label(request.status)}</span>
              </div>

              <div className="pickup-request-grid">
                <div><span>Requested</span><b>{localDateTime(request.created_at)}</b></div>
                <div><span>Pickup window</span><b>{request.scheduled_window_start ? localDateTime(request.scheduled_window_start) : "Not scheduled"}</b></div>
                <div><span>Area</span><b>{request.area_city || "—"}</b></div>
                <div><span>Type</span><b>{label(request.request_type)} · {label(request.category)}</b></div>
                <div><span>Items</span><b>{request.item_count ?? "—"}</b></div>
                <div><span>Estimated resale</span><b>{cad(request.estimated_resale_value_cents)}</b></div>
                <div><span>Pickup fee</span><b>{request.pickup_fee_cents ? cad(request.pickup_fee_cents) : "Free"}</b></div>
                <div><span>Confirmation</span><b>{label(request.confirmation_status)}</b></div>
              </div>

              <div className="pickup-contact">
                <p><b>Pickup address:</b> {request.address}</p>
                {request.brand_notes ? <p><b>Customer notes / brands:</b> {request.brand_notes}</p> : null}
              </div>

              <div className="pickup-request-actions">
                <form action={updatePickupRequestStatus}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <select name="status" defaultValue={request.status} aria-label="Pickup status">
                    <option value="submitted">Submitted</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="collected">Collected</option>
                    <option value="inspection">Inspection</option>
                    <option value="completed">Completed</option>
                    <option value="missed">Missed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button type="submit">Update status</button>
                </form>
                <Link className="intake-link" href={`/admin/items?owner_id=${encodeURIComponent(request.user_id)}&collection_request_id=${encodeURIComponent(request.id)}`}>
                  Intake customer items →
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="empty">No pickup requests yet.</p>}
    </section>
  );
}
