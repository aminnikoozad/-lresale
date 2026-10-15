import { authorizeAssistantOperation } from "@/lib/assistant-authorization";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeOperation } from "@/lib/assistant-contract";
import { isPhoneVerificationRequired } from "@/lib/canadian-phone";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    return NextResponse.json(
      { error: "Please sign in.", login: true },
      { status: 401 },
    );
  if (isPhoneVerificationRequired() && !user.phone_confirmed_at)
    return NextResponse.json(
      { error: "Verify your phone first.", verify: true },
      { status: 403 },
    );
  const raw = await req.text();
  if (raw.length > 12000)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const op = sanitizeOperation(input);
  if (!op)
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const authorized = await authorizeAssistantOperation(
    op,
    user.id,
    async (requirement) => {
      const { data, error } = await supabase
        .from(requirement.table)
        .select("id")
        .eq("id", requirement.id)
        .eq(requirement.ownerColumn, requirement.ownerId)
        .maybeSingle();
      return !error && !!data;
    },
  );
  if (!authorized)
    return NextResponse.json(
      { error: "This action is not available for your account." },
      { status: 403 },
    );
  if (op.name === "checkout") {
    const f = op.fields;
    if (
      !f.recipient_name ||
      f.recipient_name.length > 120 ||
      !f.address_line1 ||
      f.address_line1.length > 200 ||
      !f.city ||
      f.city.length > 100 ||
      !/^[A-Z]{2}$/.test(f.province || "") ||
      !/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(f.postal_code || "")
    )
      return NextResponse.json(
        { error: "Review the delivery address." },
        { status: 400 },
      );
    const response = NextResponse.json({ success: true });
    response.cookies.set(
      "rewear-delivery-draft",
      JSON.stringify({
        userId: user.id,
        recipientName: f.recipient_name,
        addressLine1: f.address_line1,
        city: f.city,
        province: f.province,
        postalCode: f.postal_code,
      }),
      {
        httpOnly: true,
        secure: req.nextUrl.protocol === "https:",
        sameSite: "strict",
        maxAge: 600,
        path: "/checkout",
      },
    );
    return response;
  }
  const f = op.fields;
  const uuid = (key: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      f[key] || "",
    );
  let error;
  switch (op.name) {
    case "favorite":
      if (!uuid("item_id")) break;
      ({ error } = await supabase
        .from("favorites")
        .upsert(
          { user_id: user.id, item_id: f.item_id, notify_price_drop: false },
          { onConflict: "user_id,item_id" },
        ));
      break;
    case "unfavorite":
      if (!uuid("item_id")) break;
      ({ error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("item_id", f.item_id));
      break;
    case "confirm_pickup":
    case "cancel_pickup":
      if (!uuid("request_id")) break;
      ({ error } = await supabase.rpc(
        op.name === "confirm_pickup"
          ? "confirm_own_pickup"
          : "cancel_own_pickup",
        { p_request_id: f.request_id },
      ));
      break;
    case "unsold_preference":
      if (!uuid("item_id") || !["return", "donate"].includes(f.preference))
        break;
      ({ error } = await supabase.rpc("set_item_disposition_preference", {
        target_item_id: f.item_id,
        target_preference: f.preference,
      }));
      break;
    case "cancel_checkout":
      if (!uuid("order_id")) break;
      ({ error } = await supabase.rpc("cancel_prepared_checkout", {
        p_order: f.order_id,
      }));
      break;
    case "request_return":
      if (
        !uuid("order_id") ||
        !uuid("order_item_id") ||
        ![
          "not_as_described",
          "damaged",
          "wrong_item",
          "fit_or_preference",
          "other",
        ].includes(f.reason)
      )
        break;
      ({ error } = await supabase.from("return_requests").insert({
        buyer_id: user.id,
        order_id: f.order_id,
        order_item_id: f.order_item_id,
        reason: f.reason,
        details: f.details || null,
      }));
      break;
    case "change_username":
      if (!/^[a-z0-9][a-z0-9._]{2,29}$/.test(f.username || "")) break;
      ({ error } = await supabase.rpc("set_my_username", {
        candidate: f.username,
      }));
      break;
    case "mark_alerts_read":
      ({ error } = await supabase
        .from("price_drop_alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null));
      break;
    default:
      return NextResponse.json(
        { error: "Use the review form for this action." },
        { status: 400 },
      );
  }
  // undefined means the arguments did not pass validation; null is a successful DB result.
  if (error === undefined)
    return NextResponse.json(
      { error: "Review the required details." },
      { status: 400 },
    );
  if (error)
    return NextResponse.json(
      {
        error:
          "This action could not be completed. Refresh the details and try again.",
      },
      { status: 409 },
    );
  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
