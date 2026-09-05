"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeSellingRules } from "@/lib/business-rules";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function number(formData: FormData, key: string) {
  return Number(text(formData, key));
}

function dollarsToCents(value: number) {
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

function percentToBps(value: number) {
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

function messageUrl(message: string, type: "success" | "error") {
  const params = new URLSearchParams({ message, type });
  return `/admin/settings?${params.toString()}`;
}

export async function updateSellingRules(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: allowed, error: permissionError } = await supabase.rpc("can_manage_selling_rules");
  if (permissionError || !allowed) {
    redirect(messageUrl("Owner or authorized Admin permission is required.", "error"));
  }
  if (formData.get("confirm_change") !== "accepted") {
    redirect(messageUrl("Confirm the business-rule change before saving.", "error"));
  }

  const reason = text(formData, "reason");
  if (reason.length < 3 || reason.length > 500) {
    redirect(messageUrl("Enter a reason for this rules change.", "error"));
  }

  const minimumIndividualItemValueCents = dollarsToCents(number(formData, "minimum_item_value"));
  const minimumPickupEstimatedValueCents = dollarsToCents(number(formData, "minimum_pickup_value"));
  const minimumSellingPriceCents = dollarsToCents(number(formData, "minimum_selling_price"));
  const freePickupThresholdCents = dollarsToCents(number(formData, "free_pickup_threshold"));
  const lowValuePickupItemFeeCents = dollarsToCents(number(formData, "low_value_pickup_item_fee"));
  const bagMinimumEstimatedValueCents = dollarsToCents(number(formData, "bag_minimum_value"));
  const sellingPeriodDays = number(formData, "selling_period_days");
  const highValueThresholdCents = dollarsToCents(number(formData, "high_value_threshold"));
  const secondMissedPickupFeeCents = dollarsToCents(number(formData, "second_missed_pickup_fee"));
  const suspendFreePickupAfterMisses = number(formData, "suspend_after_misses");
  const storeCreditBonusBps = percentToBps(number(formData, "store_credit_bonus_percent"));
  const returnPeriodText = text(formData, "return_period_days");
  const returnPeriodDays = returnPeriodText ? Number(returnPeriodText) : null;

  const tiers = [1, 2, 3, 4].map((index) => {
    const minCents = dollarsToCents(number(formData, `tier_${index}_min`));
    const maxText = text(formData, `tier_${index}_max`);
    const maxCents = maxText ? dollarsToCents(Number(maxText)) : null;
    const sellerBps = percentToBps(number(formData, `tier_${index}_seller`));
    return {
      minCents,
      maxCents,
      sellerBps,
      platformBps: 10_000 - sellerBps,
    };
  });

  const discountText = text(formData, "discount_schedule");
  let discountSchedule: Array<{ startDay: number; discountBps: number }> = [];
  if (discountText) {
    try {
      const parsed = JSON.parse(discountText);
      if (!Array.isArray(parsed)) throw new Error("not array");
      discountSchedule = parsed.map((entry) => ({
        startDay: Number(entry.startDay),
        discountBps: Number(entry.discountBps),
      }));
    } catch {
      redirect(messageUrl("Discount schedule must be a valid JSON array.", "error"));
    }
  }

  const numericValues = [
    minimumIndividualItemValueCents,
    minimumPickupEstimatedValueCents,
    minimumSellingPriceCents,
    freePickupThresholdCents,
    lowValuePickupItemFeeCents,
    bagMinimumEstimatedValueCents,
    sellingPeriodDays,
    highValueThresholdCents,
    secondMissedPickupFeeCents,
    suspendFreePickupAfterMisses,
    storeCreditBonusBps,
    ...(returnPeriodDays === null ? [] : [returnPeriodDays]),
    ...tiers.flatMap((tier) => [tier.minCents, tier.maxCents ?? 0, tier.sellerBps]),
  ];
  if (numericValues.some((value) => !Number.isInteger(value) || value < 0)) {
    redirect(messageUrl("Check the numeric selling-rule values.", "error"));
  }
  if (
    minimumIndividualItemValueCents < 1 ||
    minimumPickupEstimatedValueCents < 1 ||
    freePickupThresholdCents < 1 ||
    bagMinimumEstimatedValueCents < 1
  ) {
    redirect(messageUrl("Minimum item, pickup and Bag / Box values must be greater than zero.", "error"));
  }
  if (tiers.some((tier) => tier.sellerBps > 10_000 || tier.platformBps < 0 || tier.sellerBps + tier.platformBps !== 10_000)) {
    redirect(messageUrl("Commission percentages must be between 0% and 100% and total 100%.", "error"));
  }

  const sorted = [...tiers].sort((a, b) => a.minCents - b.minCents);
  if (sorted[0]?.minCents !== minimumIndividualItemValueCents) {
    redirect(messageUrl("The first commission tier must start at the minimum individual item value.", "error"));
  }
  for (let index = 0; index < sorted.length; index += 1) {
    const tier = sorted[index];
    if (tier.maxCents !== null && tier.maxCents < tier.minCents) {
      redirect(messageUrl("A commission tier maximum cannot be below its minimum.", "error"));
    }
    if (index > 0) {
      const previous = sorted[index - 1];
      if (previous.maxCents === null || tier.minCents !== previous.maxCents + 1) {
        redirect(messageUrl("Commission tiers must be continuous with no gaps or overlaps.", "error"));
      }
    }
  }
  if (sorted.at(-1)?.maxCents !== null) {
    redirect(messageUrl("The final commission tier must have no maximum.", "error"));
  }

  const proposed = normalizeSellingRules({
    minimumIndividualItemValueCents,
    minimumPickupEstimatedValueCents,
    commissionTiers: sorted,
    bundleEligibility: formData.get("bundle_eligibility") === "enabled",
    sellingPeriodDays,
    discountSchedule,
    minimumSellingPriceCents,
    pickupRules: {
      confirmationRequired: formData.get("pickup_confirmation_required") === "enabled",
      firstMissedPickupFeeCents: 0,
      secondMissedPickupFeeCents,
      suspendFreePickupAfterMisses,
      freePickupThresholdCents,
      lowValuePickupItemFeeCents,
      bagMinimumEstimatedValueCents,
      priorityPickupAtOrAboveThreshold: formData.get("priority_pickup_enabled") === "enabled",
    },
    storeCreditBonusBps,
    returnPeriodDays,
    highValueThresholdCents,
  });

  const effectiveAtText = text(formData, "effective_at");
  const effectiveDate = effectiveAtText ? new Date(effectiveAtText) : new Date();
  if (!Number.isFinite(effectiveDate.getTime())) {
    redirect(messageUrl("Enter a valid effective date and time.", "error"));
  }
  const effectiveAt = effectiveDate.toISOString();

  const { error } = await supabase.rpc("update_selling_rules", {
    new_rules: proposed,
    change_reason: reason,
    new_effective_at: effectiveAt,
  });

  if (error) {
    console.error("[admin/settings] selling rules update failed", { code: error.code, message: error.message });
    redirect(messageUrl("The selling rules could not be saved.", "error"));
  }

  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath("/pickup-policy");
  revalidatePath("/admin/settings");
  redirect(messageUrl("Selling rules saved and versioned successfully.", "success"));
}
