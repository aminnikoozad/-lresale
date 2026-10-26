"use server";

import { HOME_SUBCATEGORIES } from "@/lib/home-decor";
import {
  isCatalogCategory,
} from "@/lib/catalog-taxonomy";
import { loadPilotSettings, pilotAllowsCategory } from "@/lib/pilot-settings";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeCanadianPhone, isPhoneVerificationRequired } from "@/lib/canadian-phone";
import { loadSellingRules } from "@/lib/business-rules";

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function accountMessage(message: string, type: "success" | "error") {
  const params = new URLSearchParams({ message, type });
  return `/account/seller?${params.toString()}`;
}

function cad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export async function createCollectionRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isPhoneVerificationRequired() && !user.phone_confirmed_at) redirect("/verify-phone");

  const mandate = await supabase.rpc("my_team_pricing_mandate");
  if (mandate.error || !mandate.data) {
    redirect(accountMessage("Pricing terms could not be verified. Please try again.", "error"));
  }
  const needsPricingConsent = !mandate.data.accepted;
  if (needsPricingConsent && (formData.get("collection_terms_accepted") !== "accepted" || formData.get("pricing_mandate_version") !== "2026-10-15-team-v1")) {
    redirect(accountMessage("Accept the pricing authorization in the collection form.", "error"));
  }

  const [rules, pilot] = await Promise.all([
    loadSellingRules(supabase),
    loadPilotSettings(supabase),
  ]);
  const requestType = value(formData, "request_type");
  const category = value(formData, "category");
  const street = value(formData, "street_address");
  const unit = value(formData, "address_unit");
  const city = value(formData, "address_city");
  const postalCode = value(formData, "postal_code").toUpperCase().replace(/\s/g, "");
  const contactPhone = normalizeCanadianPhone(value(formData, "contact_phone"));
  if (street.length < 5 || street.length > 200 || unit.length > 50 || city.length < 2 || city.length > 100 ||
      !/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ]\d[ABCEGHJ-NPRSTVWXYZ]\d$/.test(postalCode) || !contactPhone) {
    redirect(accountMessage("Enter a complete pickup address, valid Canadian postal code and phone number.", "error"));
  }
  const formattedPostalCode = `${postalCode.slice(0, 3)} ${postalCode.slice(3)}`;
  const address = [street, unit ? `Unit ${unit}` : "", city, "QC", formattedPostalCode, "Canada"].filter(Boolean).join(", ");
  const mixedClothingAllowed = !pilot.enabled || ["women", "men", "kids"].every(entry => pilot.categories.includes(entry as "women" | "men" | "kids"));
  const pickupSlotId = value(formData, "pickup_slot_id");
  const itemCount = Number(value(formData, "item_count"));
  const brandNotes = value(formData, "brands");
  const estimatedValue = Number(value(formData, "estimated_value"));
  const estimatedValueCents = Math.round(estimatedValue * 100);
  const allTermsAccepted = formData.get("collection_terms_accepted") === "accepted";

  const isBagRequest = requestType === "bag";

  if (
    !["bag", "pickup"].includes(requestType) ||
    !(category === "clothing" ? mixedClothingAllowed : isCatalogCategory(category) && pilotAllowsCategory(category, pilot)) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pickupSlotId) ||
    address.length < 10 ||
    address.length > 500 ||
    !Number.isInteger(itemCount) ||
    itemCount < 1 ||
    itemCount > 500 ||
    brandNotes.length > 500 ||
    !Number.isFinite(estimatedValue) ||
    estimatedValueCents < rules.minimumPickupEstimatedValueCents ||
    estimatedValueCents > 100_000_000 ||
    !allTermsAccepted
  ) {
    redirect(accountMessage("Check the request details and accept all required terms and fees.", "error"));
  }

  if (isBagRequest && estimatedValueCents < rules.pickupRules.bagMinimumEstimatedValueCents) {
    redirect(accountMessage(
      `Shikimomo Bag requests require an estimated resale value of at least ${cad(rules.pickupRules.bagMinimumEstimatedValueCents)}. You can still use your own bag or box and request pickup instead.`,
      "error",
    ));
  }


  const homeIntake: Record<string,string|boolean> = {};
  let subcategoryHint: string | null = null;
  if (category === "home_decor") {
    const type = value(formData, "home_type");
    if (!HOME_SUBCATEGORIES.includes(type as typeof HOME_SUBCATEGORIES[number])) {
      redirect(accountMessage("Choose a Home & Decor item type.", "error"));
    }
    subcategoryHint = type;
    for (const key of ["type", "maker", "age", "dimensions", "damage", "mark"]) {
      const text = value(formData, `home_${key}`);
      if (text.length > 1000) redirect(accountMessage("Please shorten your item description.", "error"));
      if (text) homeIntake[key] = text;
    }
    homeIntake.fragile = formData.get("home_fragile") === "on";
  }

  const { data: slot, error: slotError } = await supabase.from("pickup_slots")
    .select("service_area_id,active,window_start,capacity,booked_count")
    .eq("id", pickupSlotId).maybeSingle();
  if (slotError || !slot || !slot.active || new Date(slot.window_start).getTime() <= Date.now() || slot.booked_count >= slot.capacity) {
    redirect(accountMessage("This pickup time is no longer available. Please choose another time.", "error"));
  }
  const serviceAreaId = slot.service_area_id;

  if (needsPricingConsent) {
    const { error: pricingError } = await supabase.rpc("accept_team_pricing_mandate", { expected_version: "2026-10-15-team-v1" });
    if (pricingError) redirect(accountMessage("Pricing terms could not be saved. Please try again.", "error"));
  }

  const { data: savedRequest, error } = await supabase
    .from("collection_requests")
    .insert({
      user_id: user.id,
      request_type: requestType,
      category,
      subcategory_hint: subcategoryHint,
      home_intake: homeIntake,
      address,
      contact_phone: contactPhone,
      pickup_address: { street, unit, city, province: "QC", postal_code: formattedPostalCode, country: "CA" },
      service_area_id: serviceAreaId,
      pickup_slot_id: pickupSlotId,
      item_count: itemCount,
      brand_notes: brandNotes || null,
      estimated_resale_value_cents: estimatedValueCents,
      condition_confirmed: true,
      policy_accepted: true,
      pickup_policy_accepted: true,
    })
    .select("batch_code,pickup_fee_cents,pickup_pricing_mode,priority_pickup,processing_fee_cents,bag_fee_cents,promotion_code,promotion_claim_number,service_fee_waived_cents")
    .single();

  if (error || !savedRequest) {
    console.error("[account] collection request failed", { code: error?.code, message: error?.message });
    redirect(accountMessage("The request could not be saved. Please try again.", "error"));
  }

  const pickupFeeCents = Number(savedRequest.pickup_fee_cents ?? 0);
  const processingFeeCents = Number(savedRequest.processing_fee_cents ?? 0);
  const waivedServiceFeeCents = Number(savedRequest.service_fee_waived_cents ?? 0);
  const promoApplied = typeof savedRequest.promotion_code === "string" && waivedServiceFeeCents > 0;
  const promoClaimNumber = Number(savedRequest.promotion_claim_number ?? 0);
  const serviceFees = [`${cad(processingFeeCents)} service`];
  if (pickupFeeCents > 0) serviceFees.push(`${cad(pickupFeeCents)} pickup`);
  const batch = typeof savedRequest.batch_code === "string" ? savedRequest.batch_code : "Your batch";
  const promoMessage = promoApplied
    ? ` Launch offer applied: ${cad(waivedServiceFeeCents)} batch service fee waived${Number.isInteger(promoClaimNumber) && promoClaimNumber > 0 ? ` (claim #${promoClaimNumber})` : ""}.`
    : "";

  redirect(accountMessage(
    `${batch} was submitted.${promoMessage} Recorded fees: ${serviceFees.join(" + ")}. A Shikimomo Bag is included in the batch service fee when requested.`,
    "success",
  ));
}

export async function approveItemPricing(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isPhoneVerificationRequired() && !user.phone_confirmed_at) redirect("/verify-phone");

  const itemId = value(formData, "item_id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId)) {
    redirect(accountMessage("The item could not be identified.", "error"));
  }

  const expectedPrice = Number(value(formData, "expected_price"));
  if (!Number.isInteger(expectedPrice) || expectedPrice < 1 || expectedPrice > 100_000_000) {
    redirect(accountMessage("Refresh and review the proposed price.", "error"));
  }
  const { error } = await supabase.rpc("approve_item_pricing", { target_item_id: itemId, expected_price: expectedPrice });
  if (error) {
    redirect(accountMessage("This price could not be approved. It may already be locked or no longer available.", "error"));
  }
  redirect(accountMessage("Price approved. Your commission rate is now permanently locked for this item.", "success"));
}

export async function approveBundlePricing(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isPhoneVerificationRequired() && !user.phone_confirmed_at) redirect("/verify-phone");

  const bundleId = value(formData, "bundle_id");
  const expectedPrice = Number(value(formData, "expected_price"));
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bundleId) ||
    !Number.isInteger(expectedPrice) ||
    expectedPrice < 1 ||
    expectedPrice > 100_000_000
  ) {
    redirect(accountMessage("The bundle pricing could not be identified.", "error"));
  }

  const { error } = await supabase.rpc("approve_bundle_pricing", {
    target_bundle_id: bundleId,
    expected_price: expectedPrice,
  });
  if (error) {
    redirect(accountMessage("This bundle price could not be approved. Refresh and review it again.", "error"));
  }

  redirect(accountMessage("Bundle price approved. Its commission rate is now permanently locked.", "success"));
}

