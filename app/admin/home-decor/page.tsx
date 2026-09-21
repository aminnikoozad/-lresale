import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadSellingRules, formatCadFromCents } from "@/lib/business-rules";
import {
  HOME_SUBCATEGORIES,
  HOME_ERAS,
  HOME_CONDITIONS,
  HOME_STAGES,
  HOME_TEXT_FIELDS,
  HOME_NUMBER_FIELDS,
  HOME_BOOL_FIELDS,
  HOME_STAFF_FIELDS,
  HOME_PACKAGE_FIELDS,
  HOME_CHECKS,
  HOME_FLAGS,
  HOME_DEFECTS,
  HOME_REJECTIONS,
  HOME_PHOTO_ROLES,
  fieldLabel,
  type HomeDetails,
} from "@/lib/home-decor";
import { saveHomeInspection, saveHomeRules, uploadHomePhotos } from "./actions";
import "../items/items.css";
import "./home.css";
export const dynamic = "force-dynamic";
type RecordItem = HomeDetails & {
  name: string;
  brand: string | null;
  status: string;
  photo_urls: string[];
  seller_intake: Record<string, string | boolean>;
};
const filters = [
  "All",
  "Vintage",
  "Collectibles",
  "Fragile",
  "Oversized",
  "Needs Specialist Review",
  "Compliance Review Required",
  "Missing measurements",
  "Missing defect photos",
  "Ready to Publish",
];
function matches(i: RecordItem, f: string) {
  if (f === "Vintage")
    return String(i.public_data.subcategory).includes("Vintage");
  if (f === "Collectibles")
    return String(i.public_data.subcategory).includes("Collectibles");
  if (f === "Fragile" || f === "Oversized")
    return i.public_data[f.toLowerCase()] === true;
  if (f === "Missing measurements") return i.missing?.includes("Measurements");
  if (f === "Missing defect photos")
    return i.missing?.includes("Defect photos");
  if (f === "Ready to Publish")
    return !i.missing?.length && i.status !== "listed";
  if (f === "Needs Specialist Review" || f === "Compliance Review Required")
    return i.missing?.includes(f) || i.inspection_stage === f;
  return true;
}
export default async function HomeInspectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const permission = await db.rpc("can_manage_items");
  if (permission.error || !permission.data) redirect("/account");
  const [result, rules, base, params] = await Promise.all([
    db.rpc("admin_home_items"),
    db
      .from("home_acceptance_rules")
      .select("*")
      .eq("category", "home_decor")
      .single(),
    loadSellingRules(db),
    searchParams,
  ]);
  const items = (result.data ?? []) as RecordItem[];
  const current = items.find((i) => i.item_id === params.item);
  const rule = rules.data;
  const list = items.filter((i) => matches(i, params.filter ?? "All"));
  const select = (name: string, options: readonly string[], value: unknown) => (
    <label key={name}>
      {fieldLabel(name)}
      <select name={name} defaultValue={String(value ?? "")}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
  const text = (name: string, value: unknown, multiline = false) => (
    <label key={name}>
      {fieldLabel(name)}
      {multiline ? (
        <textarea
          name={name}
          defaultValue={String(value ?? "")}
          maxLength={
            HOME_STAFF_FIELDS.includes(
              name as (typeof HOME_STAFF_FIELDS)[number],
            )
              ? 4000
              : 2000
          }
          rows={3}
        />
      ) : (
        <input
          name={name}
          defaultValue={String(value ?? "")}
          maxLength={2000}
        />
      )}
    </label>
  );
  const numbers = (names: readonly string[], data: Record<string, unknown>) =>
    names.map((k) => (
      <label key={k}>
        {fieldLabel(k)}
        <input
          name={k}
          type="number"
          min="0.001"
          max="100000"
          step="any"
          defaultValue={String(data[k] ?? "")}
        />
      </label>
    ));
  const check = (key: string, checked: unknown) => (
    <label className="home-check" key={key}>
      <input type="checkbox" name={key} defaultChecked={checked === true} />
      {fieldLabel(key)}
    </label>
  );
  return (
    <main className="admin-items-shell">
      <header className="admin-items-top">
        <Link href="/" className="brand">
          REWEAR.
        </Link>
        <nav>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/items">Item Management</Link>
          <Link href="/admin/operations">Pickups</Link>
        </nav>
      </header>
      <div className="admin-items-wrap">
        <div className="admin-items-heading">
          <div>
            <p className="eyebrow dark">Managed resale • Inspection</p>
            <h1>Home &amp; Decor</h1>
            <p>
              Receive, inspect, photograph and prepare each piece. Seller
              information is preliminary; REWEAR determines final listing
              details after physical inspection.
            </p>
          </div>
          <Link className="primary-action" href="/admin/items">
            Receive an item
          </Link>
        </div>
        {params.message ? (
          <p role="status" className="admin-items-message">
            {params.message}
          </p>
        ) : null}
        {result.error || rules.error ? (
          <p role="alert">
            Home inspection data could not be loaded. Please try again.
          </p>
        ) : null}
        <details className="admin-items-card">
          <summary>Acceptance settings</summary>
          <p>
            Owner/Admin only. Leave the minimum blank to inherit the current
            individual minimum (
            {formatCadFromCents(base.minimumIndividualItemValueCents)}). Pickup
            minimums and commission rates are unchanged.
          </p>
          <form action={saveHomeRules} className="home-form">
            <label>
              Minimum individual resale value (CAD)
              <input
                name="minimum"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={
                  rule?.minimum_value_cents == null
                    ? ""
                    : rule.minimum_value_cents / 100
                }
              />
            </label>
            {check("bundle", rule?.bundle_eligible)}
            {check("oversized", rule?.allow_oversized)}
            <button className="primary-action">Save acceptance rules</button>
          </form>
        </details>
        <form className="home-filter" method="get">
          <label>
            Filter inspections
            <select name="filter" defaultValue={params.filter ?? "All"}>
              {filters.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <button className="primary-action">Apply</button>
        </form>
        <section className="admin-items-card">
          <h2>Inspection queue</h2>
          {!list.length ? (
            <p>
              No Home &amp; Decor items in this view. Receive an item through
              Item Management to begin.
            </p>
          ) : (
            list.map((i) => (
              <Link
                className="home-queue-row"
                key={i.item_id}
                href={`/admin/home-decor?item=${i.item_id}`}
              >
                <span>
                  <b>{i.name}</b>
                  <small>
                    {i.public_data.subcategory || "Not categorized"} ·{" "}
                    {i.status === "listed" ? "Published" : i.inspection_stage}
                  </small>
                </span>
                <span>
                  {i.missing?.length
                    ? `${i.missing.length} requirements remaining`
                    : "Complete · ready to publish"}
                </span>
              </Link>
            ))
          )}
        </section>
        {current ? (
          <section className="admin-items-card">
            <h2>{current.name}</h2>
            <p>
              {current.brand || "Maker unknown"} · {current.status}
            </p>
            <div className="home-completeness">
              <strong>
                {current.missing?.length
                  ? "Before publishing"
                  : "Listing information complete"}
              </strong>
              {current.missing?.length ? (
                <ul>
                  {current.missing.map((m) => (
                    <li key={m}>{fieldLabel(m)}</li>
                  ))}
                </ul>
              ) : (
                <Link href="/admin/items">Open Item Management to publish</Link>
              )}
            </div>
            {Object.keys(current.seller_intake ?? {}).length > 0 ? (
              <details>
                <summary>Seller’s preliminary information (private)</summary>
                <dl>
                  {Object.entries(current.seller_intake).map(([k, v]) => (
                    <div key={k}>
                      <dt>{fieldLabel(k)}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
            <form
              className="home-form"
              action={saveHomeInspection}
              key={current.item_id}
            >
              <input type="hidden" name="item_id" value={current.item_id} />
              <p>
                Saving edits to a live listing removes it from sale until it is
                reviewed and published again.
              </p>
              <div className="home-field-grid">
                {select(
                  "inspection_stage",
                  HOME_STAGES.filter((s) => s !== "Published"),
                  current.inspection_stage === "Published"
                    ? "Ready to List"
                    : current.inspection_stage,
                )}
                {select(
                  "subcategory",
                  HOME_SUBCATEGORIES,
                  current.public_data.subcategory,
                )}
                {select(
                  "condition",
                  HOME_CONDITIONS,
                  current.public_data.condition,
                )}
                {select("era", HOME_ERAS, current.public_data.era)}
              </div>
              <details open>
                <summary>Public listing details</summary>
                <div className="home-field-grid">
                  {HOME_TEXT_FIELDS.map((k) =>
                    text(
                      k,
                      current.public_data[k],
                      k.includes("notes") ||
                        [
                          "visible_defects",
                          "missing_components",
                          "restoration_history",
                          "delivery_note",
                        ].includes(k),
                    ),
                  )}
                  {numbers(HOME_NUMBER_FIELDS, current.public_data)}
                </div>
                <div className="home-check-grid">
                  {HOME_BOOL_FIELDS.map((k) =>
                    check(k, current.public_data[k]),
                  )}
                </div>
                <p>
                  Era is an estimate, not an antique certification. Dimensions
                  are in cm and weight is in kg.
                </p>
              </details>
              <details open>
                <summary>Condition &amp; disclosed defects</summary>
                <div className="home-check-grid">
                  {HOME_DEFECTS.map((k) => (
                    <label className="home-check" key={k}>
                      <input
                        type="checkbox"
                        name="defects"
                        value={k}
                        defaultChecked={current.defects.includes(k)}
                      />
                      {fieldLabel(k)}
                    </label>
                  ))}
                </div>
                <p>
                  Every selected defect is public. Describe severity under
                  Visible defects and include defect photos.
                </p>
              </details>
              <details>
                <summary>Private inspection &amp; evidence</summary>
                <div className="home-field-grid">
                  {HOME_STAFF_FIELDS.map((k) =>
                    text(k, current.staff_data[k], true),
                  )}
                  {select(
                    "authentication_status",
                    [
                      "Not authenticated",
                      "Needs Specialist Review",
                      "Authenticated",
                    ],
                    current.public_data.authentication_status ??
                      "Not authenticated",
                  )}
                </div>
                {check(
                  "specialist_review_required",
                  current.staff_data.specialist_review_required,
                )}
                <p>
                  Only Owner/Admin may sign off specialist/compliance reviews or
                  approve an authentication claim. A required specialist review
                  cannot be cleared without documented review.
                </p>
              </details>
              <details>
                <summary>Packaging &amp; shipping readiness (private)</summary>
                <div className="home-field-grid">
                  {numbers(HOME_PACKAGE_FIELDS, current.staff_data)}
                </div>
                <div className="home-check-grid">
                  {[
                    "double_box_recommended",
                    "local_delivery_preferred",
                    "manual_shipping_review_required",
                  ].map((k) => check(k, current.staff_data[k]))}
                </div>
                <p>
                  No shipping price is generated here. Record restrictions and
                  the customer-facing delivery note accurately.
                </p>
              </details>
              <details>
                <summary>Compliance &amp; rejection</summary>
                <div className="home-check-grid">
                  {HOME_FLAGS.map((k) => (
                    <label className="home-check" key={k}>
                      <input
                        type="checkbox"
                        name="compliance_flags"
                        value={k}
                        defaultChecked={current.compliance_flags.includes(k)}
                      />
                      {fieldLabel(k)}
                    </label>
                  ))}
                </div>
                <p>
                  Flags require documented Owner/Admin review before
                  publication. This checklist does not determine legal
                  eligibility.
                </p>
                {select(
                  "rejection_reason",
                  HOME_REJECTIONS,
                  current.rejection_reason,
                )}
              </details>
              <details open>
                <summary>Photo roles</summary>
                <p>
                  Choose one hero photo. Gallery order: hero, alternate angles,
                  details, defects. Up to 8 photos per item.
                </p>
                <div className="home-photo-grid">
                  {(current.photo_urls ?? []).map((url, index) => (
                    <div key={url}>
                      <Image
                        src={url}
                        alt={`Inspection photo ${index + 1}`}
                        width={150}
                        height={150}
                      />
                      <input type="hidden" name="photo_url" value={url} />
                      {select(
                        "photo_role",
                        HOME_PHOTO_ROLES,
                        current.photos.find((p) => p.url === url)?.role ??
                          (index === 0 ? "hero" : "detail"),
                      )}
                    </div>
                  ))}
                </div>
              </details>
              <details open>
                <summary>Inspection checklist</summary>
                <div className="home-check-grid">
                  {HOME_CHECKS.map((k) => check(k, current.checks[k]))}
                </div>
              </details>
              <button className="primary-action">Save inspection</button>
            </form>
            <form className="home-form" action={uploadHomePhotos}>
              <input type="hidden" name="item_id" value={current.item_id} />
              <label>
                Add photos
                <input
                  name="photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  required
                />
              </label>
              <p>
                Save inspection changes before uploading. Uploads add to
                existing photos (8 maximum).
              </p>
              <button className="primary-action">Upload photos</button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
