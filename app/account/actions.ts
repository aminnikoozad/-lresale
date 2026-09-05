"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const requestType = value(formData, "request_type");
  const category = value(formData, "category");
  const address = value(formData, "address");
  const itemCount = Number(value(formData, "item_count"));
  const brandNotes = value(formData, "brands");
  const estimatedValue = Number(value(formData, "estimated_value"));
  const allTermsAccepted = ["condition_confirmed", "policy_accepted", "pickup_policy_accepted"]
    .every((name) => formData.get(name) === "accepted");

  if (
    !["bag", "pickup"].includes(requestType) ||
    !["clothing", "electronics"].includes(category) ||
    address.length < 10 ||
    address.length > 500 ||
    !Number.isInteger(itemCount) ||
    itemCount < 1 ||
    itemCount > 500 ||
    brandNotes.length > 500 ||
    !Number.isFinite(estimatedValue) ||
    estimatedValue < 100 ||
    estimatedValue > 1_000_000 ||
    !allTermsAccepted
  ) {
    redirect(accountMessage("Check the request details and accept all required terms.", "error"));
  }

  const { error } = await supabase.from("collection_requests").insert({
    user_id: user.id,
    request_type: requestType,
    category,
    address,
    item_count: itemCount,
    brand_notes: brandNotes || null,
    estimated_resale_value_cents: Math.round(estimatedValue * 100),
    condition_confirmed: true,
    policy_accepted: true,
    pickup_policy_accepted: true,
  });

  if (error) {
    redirect(accountMessage("The request could not be saved. Please try again.", "error"));
  }
  redirect(accountMessage("Your request was submitted for eligibility review. We’ll contact you to confirm, cancel or reschedule the pickup.", "success"));
}
