import Link from "next/link";
import { ArrowLeft, LogOut, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { logout } from "../auth/actions";
import { Dashboard } from "./dashboard";
import { createClient } from "@/lib/supabase/server";
import { isPhoneVerificationRequired } from "@/lib/canadian-phone";
import "./account.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function money(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "America/Toronto" }).format(new Date(value));
}

function pickupWindowLabel(start: string, end: string) {
  const date = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" }).format(new Date(start));
  const time = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });
  return `${date} · ${time.format(new Date(start))}–${time.format(new Date(end))}`;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function AccountPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isPhoneVerificationRequired() && !user.phone_confirmed_at) redirect("/verify-phone");

  const [profileResult, itemsResult, requestsResult, walletResult, serviceAreasResult, pickupSlotsResult, params] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("items").select("id,name,status,sold_price_cents,listed_price_cents").order("created_at", { ascending: false }),
    supabase.from("collection_requests").select("id,request_type,category,status,confirmation_status,created_at").order("created_at", { ascending: false }),
    supabase.from("wallet_transactions").select("amount_cents,transaction_type,status"),
    supabase.from("service_areas").select("id,city,pickup_mode").eq("active", true).order("sort_order"),
    supabase.from("pickup_slots").select("id,service_area_id,window_start,window_end,capacity,booked_count").eq("active", true).gt("window_start", new Date().toISOString()).order("window_start"),
    searchParams,
  ]);

  const queryError = profileResult.error || itemsResult.error || requestsResult.error || walletResult.error || serviceAreasResult.error || pickupSlotsResult.error;
  if (queryError) {
    console.error("[account] customer data query failed", {
      code: queryError.code,
      message: queryError.message,
      details: queryError.details,
    });
    throw new Error("Customer account data could not be loaded.");
  }

  const wallet = walletResult.data ?? [];
  const balanceCents = wallet.filter((entry) => entry.status === "completed").reduce((sum, entry) => sum + entry.amount_cents, 0);
  const earnedCents = wallet.filter((entry) => entry.status === "completed" && entry.transaction_type === "sale_credit").reduce((sum, entry) => sum + entry.amount_cents, 0);
  const displayName = profileResult.data?.full_name || user.user_metadata.full_name || user.email || "Customer";
  const message = typeof params.message === "string" ? params.message : null;

  return <main className="account-shell">
    <header className="account-top">
      <Link href="/" className="brand">REWEAR<span>.</span></Link>
      <div className="account-user">
        <span><UserRound/> {user.email}</span>
        <form action={logout}><button className="logout-button" type="submit"><LogOut/> Sign out</button></form>
      </div>
    </header>
    <Dashboard
      name={displayName}
      message={message}
      messageType={params.type === "error" ? "error" : "success"}
      balance={money(balanceCents)}
      totalEarned={money(earnedCents)}
      items={(itemsResult.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        status: titleCase(item.status),
        price: item.sold_price_cents != null ? money(item.sold_price_cents) : item.listed_price_cents != null ? money(item.listed_price_cents) : "—",
      }))}
      requests={(requestsResult.data ?? []).map((request) => ({
        id: request.id,
        type: request.request_type === "bag" ? "Bag request" : "Pickup request",
        category: titleCase(request.category),
        status: titleCase(request.status),
        confirmationStatus: titleCase(request.confirmation_status),
        createdAt: dateLabel(request.created_at),
      }))}
      serviceAreas={(serviceAreasResult.data ?? []).map((area) => ({ id: area.id, city: area.city, pickupMode: area.pickup_mode }))}
      pickupSlots={(pickupSlotsResult.data ?? []).filter((slot) => slot.booked_count < slot.capacity).map((slot) => ({ id: slot.id, serviceAreaId: slot.service_area_id, label: pickupWindowLabel(slot.window_start, slot.window_end), remaining: slot.capacity - slot.booked_count }))}
    />
    <Link className="back-home" href="/"><ArrowLeft/> Back to marketplace</Link>
  </main>;
}
