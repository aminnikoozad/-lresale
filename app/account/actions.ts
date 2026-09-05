"use server";

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

export async function createCollectionRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isPhoneVerificationRequired() && !user.phone_confirmed_at) redirect("/verify-phone");

  const rules = await loadSellingRules(supabase);
  const requestType = value(formData, "request_type");
  const category = value(formData, "category");
  const address = value(formData, "address");
  const serviceAreaId = value(formData, "service_area_id");
  const pickupSlotId = value(formData, "pickup_slot_id");
  const itemCount = Number(value(formData, "item_count"));
  const brandNotes = value(formData, "brands");
  const estimatedValue = Number(value(formData, "estimated_value"));
  const estimatedValueCents = Math.round(estimatedValue * 100);
  const allTermsAccepted = ["condition_confirmed", "policy_accepted", "pickup_policy_accepted"]
    .every((name) => formData.get(name) === "accepted");

  if (
    !["bag", "pickup"].includes(requestType) ||
    !["clothing", "electronics"].includes(category) ||
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
    redirect(accountMessage("Check the request details and accept all required terms.", "error"));
  }

  const { error } = await supabase.from("collection_requests").insert({
    user_id: user.id,
    request_type: requestType,
    category,
    address,
    service_area_id: serviceAreaId,
    pickup_slot_id: pickupSlotId,
    item_count: itemCount,
    brand_notes: brandNotes || null,
    estimated_resale_value_cents: estimatedValueCents,
    condition_confirmed: true,
    policy_accepted: true,
    pickup_policy_accepted: true,
  });

  if (error) {
    redirect(accountMessage("The request could not be saved. Please try again.", "error"));
  }
  redirect(accountMessage("Your request was submitted for eligibility review. We’ll contact you to confirm, cancel or reschedule the pickup.", "success"));
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
