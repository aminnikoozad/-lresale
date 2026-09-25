"use server";

import { HOME_SUBCATEGORIES } from "@/lib/home-decor";
import {
  isCatalogCategory,
  isCatalogSubcategory,
} from "@/lib/catalog-taxonomy";
import { loadPilotSettings, pilotAllowsCategory } from "@/lib/pilot-settings";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPhoneVerificationRequired } from "@/lib/canadian-phone";
import { loadSellingRules } from "@/lib/business-rules";

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function accountMessage(message: string, type: "success" | "error") {
  const params = new URLSearchParams({ message, type });
  return `/account?${params.toString()}`;
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

  const [rules, pilot] = await Promise.all([
    loadSellingRules(supabase),
    loadPilotSettings(supabase),
  ]);
  const requestType = value(formData, "request_type");
  const category = value(formData, "category");
  const submittedSubcategory = value(formData, "subcategory_hint");
  const address = value(formData, "address");
  const serviceAreaId = value(formData, "service_area_id");
  const pickupSlotId = value(formData, "pickup_slot_id");
  const itemCount = Number(value(formData, "item_count"));
  const brandNotes = value(formData, "brands");
  const estimatedValue = Number(value(formData, "estimated_value"));
  const estimatedValueCents = Math.round(estimatedValue * 100);
  const allTermsAccepted = ["condition_confirmed", "policy_accepted", "pickup_policy_accepted", "service_fee_accepted"]
    .every((name) => formData.get(name) === "accepted");

  const isBagRequest = requestType === "bag";
  const isFreePickupPreview = estimatedValueCents >= rules.pickupRules.freePickupThresholdCents;

  if (
    !["bag", "pickup"].includes(requestType) ||
    !isCatalogCategory(category) ||
    !pilotAllowsCategory(category, pilot) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(serviceAreaId) ||
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
      `REWEAR Bag requests require an estimated resale value of at least ${cad(rules.pickupRules.bagMinimumEstimatedValueCents)}. You can still use your own bag or box and request pickup instead.`,
      "error",
    ));
  }

  if (!isBagRequest && !isFreePickupPreview && formData.get("pickup_fee_accepted") !== "accepted") {
    redirect(accountMessage(
      `For pickups below ${cad(rules.pickupRules.freePickupThresholdCents)}, one flat pickup fee of ${cad(rules.pickupRules.lowValuePickupItemFeeCents)} applies to the whole pickup. Please accept the fee before submitting.`,
      "error",
    ));
  }

  const homeIntake: Record<string,string|boolean> = {};
  let subcategoryHint = submittedSubcategory;
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
  } else if (!isCatalogSubcategory(category, subcategoryHint)) {
    redirect(accountMessage("Choose a valid subcategory for the collection.", "error"));
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
    `${batch} was submitted.${promoMessage} Recorded fees: ${serviceFees.join(" + ")}. A REWEAR Bag is included in the batch service fee when requested.`,
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
