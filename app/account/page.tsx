import Link from "next/link";
import { ArrowLeft, LogOut, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { logout } from "../auth/actions";
import { Dashboard } from "./dashboard";
import { CommissionSection } from "@/components/commission-section";
import { CustomerBundles } from "@/components/customer-bundles";
import { createClient } from "@/lib/supabase/server";
import { isPhoneVerificationRequired } from "@/lib/canadian-phone";
import {
  commissionTierForInitialPrice,
  loadSellingRules,
} from "@/lib/business-rules";
import { CATALOG_CATEGORIES } from "@/lib/catalog-taxonomy";
import { loadLaunchSellerOffer } from "@/lib/launch-offer";
import { loadPilotSettings, pilotAllowsPickupDate } from "@/lib/pilot-settings";
import {
  commissionPercent,
  earningsFromSalePrice,
} from "@/lib/commission";
import "./account.css";
import "./commission-account.css";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}

function pickupWindowLabel(start: string, end: string) {
  const date = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
  return `${date} · ${time.format(new Date(start))}–${time.format(new Date(end))}`;
}

function pickupDayText(days: number[]) {
  const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  return days.map((day) => names[day]).filter(Boolean).join(", ") || "configured days";
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackUsername(fullName: string | null | undefined, userId: string) {
  const base = (fullName || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 21);
  return `${base.length >= 3 ? base : "user"}_${userId.replaceAll("-", "").slice(0, 8)}`;
}

function fallbackCustomerCode(userId: string) {
  return `RW-${userId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

const ACCEPTED_BATCH_STATUSES = new Set([
  "accepted",
  "bundled",
  "pricing_pending",
  "waiting_for_seller_approval",
  "approved",
  "photography_pending",
  "listing_preparation",
  "listed",
  "reserved",
  "sold",
  "return_requested",
  "return_pending",
  "returned",
  "relisted",
  "selling_period_expired",
  "return_to_seller",
  "donation_pending",
  "donated",
  "auctioned",
  "archived",
]);

export default async function AccountPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isPhoneVerificationRequired() && !user.phone_confirmed_at)
    redirect("/verify-phone");

  const [
    profileResult,
    itemsResult,
    requestsResult,
    walletResult,
    serviceAreasResult,
    pickupSlotsResult,
    sellingRules,
    launchOffer,
    pilot,
    params,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("items")
      .select(
        "id,collection_request_id,name,status,initial_approved_price_cents,listed_price_cents,sold_price_cents,locked_seller_commission_bps,locked_platform_commission_bps,seller_pricing_approved_at,estimated_seller_earnings_cents,final_seller_earnings_cents",
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("collection_requests")
      .select("id,batch_code,request_type,category,status,confirmation_status,created_at,item_count,pickup_fee_cents,pickup_pricing_mode,priority_pickup,processing_fee_cents,bag_fee_cents,promotion_claim_number,service_fee_waived_cents")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("wallet_transactions")
      .select("amount_cents,transaction_type,status")
      .eq("user_id", user.id),
    supabase
      .from("service_areas")
      .select("id,city,pickup_mode")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("pickup_slots")
      .select(
        "id,service_area_id,window_start,window_end,capacity,booked_count",
      )
      .eq("active", true)
      .gt("window_start", new Date().toISOString())
      .order("window_start"),
    loadSellingRules(supabase),
    loadLaunchSellerOffer(supabase),
    loadPilotSettings(supabase),
    searchParams,
  ]);

  const queryError =
    profileResult.error ||
    itemsResult.error ||
    requestsResult.error ||
    walletResult.error ||
    serviceAreasResult.error ||
    pickupSlotsResult.error;
  if (queryError) {
    console.error("[account] customer data query failed", {
      code: queryError.code,
      message: queryError.message,
      details: queryError.details,
    });
    throw new Error("Customer account data could not be loaded.");
  }

  const wallet = walletResult.data ?? [];
  const balanceCents = wallet
    .filter((entry) => entry.status === "completed")
    .reduce((sum, entry) => sum + entry.amount_cents, 0);
  const earnedCents = wallet
    .filter(
      (entry) =>
        entry.status === "completed" &&
        entry.transaction_type === "sale_credit",
    )
    .reduce((sum, entry) => sum + entry.amount_cents, 0);

  const profile = profileResult.data as
    | {
        full_name?: string | null;
        username?: string | null;
        customer_code?: string | null;
      }
    | null;

  const displayName =
    profile?.full_name ||
    user.user_metadata.full_name ||
    user.email ||
    "Customer";
  const username =
    profile?.username ||
    user.user_metadata.username ||
    fallbackUsername(displayName, user.id);
  const customerCode =
    profile?.customer_code || fallbackCustomerCode(user.id);
  const message = typeof params.message === "string" ? params.message : null;

  const availablePickupSlots = (pickupSlotsResult.data ?? []).filter((slot) =>
    pilotAllowsPickupDate(slot.window_start, pilot),
  );
  const activeCategories = pilot.enabled
    ? pilot.categories
    : CATALOG_CATEGORIES.map((entry) => entry.value);
  const rawItems = itemsResult.data ?? [];
  const rawRequests = requestsResult.data ?? [];
  const launchOfferEligible = launchOffer.active && rawRequests.length === 0;

  return (
    <main className="account-shell">
      <header className="account-top">
        <Link href="/" className="brand">
          REWEAR<span>.</span>
        </Link>
        <div className="account-user">
          <span>
            <UserRound /> {user.email}
          </span>
          <form action={logout}>
            <button className="logout-button" type="submit">
              <LogOut /> Sign out
            </button>
          </form>
        </div>
      </header>
      <Dashboard
        name={displayName}
        username={username}
        customerCode={customerCode}
        message={message}
        messageType={params.type === "error" ? "error" : "success"}
        balance={money(balanceCents)}
        totalEarned={money(earnedCents)}
        activeCategories={activeCategories}
        pilotEnabled={pilot.enabled}
        pickupDayText={pickupDayText(pilot.pickupDays)}
        launchOffer={{
          active: launchOffer.active,
          eligible: launchOfferEligible,
          maxClaims: launchOffer.maxClaims,
          remaining: launchOffer.remaining,
          waivedServiceFeeCents: launchOffer.waivedServiceFeeCents,
        }}
        feeRules={{
          processingFeeCents: sellingRules.pickupRules.processingFeeCents,
          rewearBagFeeCents: sellingRules.pickupRules.rewearBagFeeCents,
          freePickupThresholdCents: sellingRules.pickupRules.freePickupThresholdCents,
          lowValuePickupItemFeeCents: sellingRules.pickupRules.lowValuePickupItemFeeCents,
          bagMinimumEstimatedValueCents: sellingRules.pickupRules.bagMinimumEstimatedValueCents,
        }}
        items={rawItems.map((item) => {
          let previewTier: { sellerBps: number; platformBps: number } | null = null;
          if (item.initial_approved_price_cents != null) {
            try {
              previewTier = commissionTierForInitialPrice(
                item.initial_approved_price_cents,
                sellingRules,
              );
            } catch {
              previewTier = null;
            }
          }
          const sellerBps =
            item.locked_seller_commission_bps ?? previewTier?.sellerBps ?? null;
          const platformBps =
            item.locked_platform_commission_bps ??
            previewTier?.platformBps ??
            null;
          const currentPriceCents =
            item.listed_price_cents ?? item.initial_approved_price_cents;
          const estimatedEarningsCents =
            item.estimated_seller_earnings_cents ??
            (currentPriceCents != null && sellerBps != null
              ? earningsFromSalePrice(currentPriceCents, sellerBps)
                  .sellerEarningsCents
              : null);

          return {
            id: item.id,
            name: item.name,
            status:
              item.initial_approved_price_cents != null &&
              !item.seller_pricing_approved_at &&
              ["accepted", "waiting_for_seller_approval"].includes(item.status)
                ? "Pricing approval required"
                : titleCase(item.status),
            initialPrice:
              item.initial_approved_price_cents != null
                ? money(item.initial_approved_price_cents)
                : "Pending review",
            initialPriceCents: item.initial_approved_price_cents ?? undefined,
            currentPrice:
              currentPriceCents != null
                ? money(currentPriceCents)
                : "Not priced",
            sellerRate:
              sellerBps != null ? commissionPercent(sellerBps) : "Pending",
            platformRate:
              platformBps != null ? commissionPercent(platformBps) : "Pending",
            estimatedEarnings:
              estimatedEarningsCents != null
                ? money(estimatedEarningsCents)
                : "Pending",
            finalEarnings:
              item.sold_price_cents != null &&
              item.final_seller_earnings_cents != null
                ? money(item.final_seller_earnings_cents)
                : "—",
            requiresApproval:
              item.initial_approved_price_cents != null &&
              !item.seller_pricing_approved_at &&
              ["accepted", "waiting_for_seller_approval"].includes(item.status),
          };
        })}
        requests={rawRequests.map((request) => {
          const batchItems = rawItems.filter((item) => item.collection_request_id === request.id);
          const acceptedCount = batchItems.filter((item) => ACCEPTED_BATCH_STATUSES.has(item.status)).length;
          const rejectedCount = batchItems.filter((item) => item.status === "rejected").length;
          const waivedServiceFeeCents = request.service_fee_waived_cents ?? 0;
          return {
            id: request.id,
            batchCode: request.batch_code,
            type:
              request.request_type === "bag" ? "REWEAR Bag request" : "Own bag / box pickup",
            category: titleCase(request.category),
            status: request.priority_pickup
              ? `${titleCase(request.status)} · Priority`
              : titleCase(request.status),
            confirmationStatus: titleCase(request.confirmation_status),
            createdAt: dateLabel(request.created_at),
            expectedItemCount: request.item_count ?? 0,
            receivedCount: batchItems.length,
            acceptedCount,
            rejectedCount,
            processingFee: money(request.processing_fee_cents ?? 0),
            bagFee: money(request.bag_fee_cents ?? 0),
            pickupFee: money(request.pickup_fee_cents ?? 0),
            promotionLabel:
              waivedServiceFeeCents > 0
                ? `Launch offer #${request.promotion_claim_number ?? "—"}: ${money(waivedServiceFeeCents)} service fee waived`
                : null,
          };
        })}
        serviceAreas={(serviceAreasResult.data ?? []).map((area) => ({
          id: area.id,
          city: area.city,
          pickupMode: area.pickup_mode,
        }))}
        pickupSlots={availablePickupSlots
          .filter((slot) => slot.booked_count < slot.capacity)
          .map((slot) => ({
            id: slot.id,
            serviceAreaId: slot.service_area_id,
            label: pickupWindowLabel(slot.window_start, slot.window_end),
            remaining: slot.capacity - slot.booked_count,
          }))}
      />
      <div className="account-commission-wrap">
        <CommissionSection />
      </div>
      <div className="dashboard" style={{ paddingTop: 0, paddingBottom: 24 }}>
        <CustomerBundles />
      </div>
      <div className="dashboard" style={{ paddingTop: 0, paddingBottom: 16 }}>
        <Link className="back-home" href="/account/operations">
          Track item timeline, review & unsold preferences →
        </Link>
      </div>
      <Link className="back-home" href="/">
        <ArrowLeft /> Back to marketplace
      </Link>
    </main>
  );
}
