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
  const estimatedValue = Number(value(formData, "estimated_value"));
  const allTermsAccepted = ["condition_confirmed", "policy_accepted", "hold_terms_accepted"]
    .every((name) => formData.get(name) === "accepted");

  if (
    !["bag", "pickup"].includes(requestType) ||
    !["clothing", "electronics"].includes(category) ||
    address.length < 10 ||
    address.length > 500 ||
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
    estimated_resale_value_cents: Math.round(estimatedValue * 100),
    condition_confirmed: true,
    policy_accepted: true,
    hold_terms_accepted: true,
  });

  if (error) {
    redirect(accountMessage("The request could not be saved. Please try again.", "error"));
  }
  redirect(accountMessage("Your collection request was submitted. We’ll contact you to confirm the date and $20 authorization.", "success"));
}
