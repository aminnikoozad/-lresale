"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { pricingWorkerReady, processPricingJobs } from "@/lib/pricing/server";
const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function itemId(f: FormData) {
  const id = text(f, "item_id");
  if (!uuid.test(id)) throw new Error("Invalid item");
  return id;
}
function finish(id: string, error: string | null, success: string) {
  revalidatePath(`/admin/items/${id}/pricing`);
  revalidatePath("/admin/items");
  revalidatePath("/admin/pricing");
  revalidatePath("/account/seller");
  redirect(
    `/admin/items/${id}/pricing?${new URLSearchParams({ message: error ?? success, type: error ? "error" : "success" })}`,
  );
}
function cents(raw: string) {
  return /^\d+(\.\d{1,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : NaN;
}
export async function addComparable(f: FormData) {
  const id = itemId(f);
  const { supabase } = await requireAdmin();
  const price = cents(text(f, "price"));
  if (!Number.isSafeInteger(price) || text(f, "authorized") !== "yes")
    finish(
      id,
      "Enter the observed CAD price and confirm authorized evidence.",
      "",
    );
  const { error } = await supabase.rpc("admin_add_market_comparable", {
    target: id,
    evidence: {
      source: text(f, "source"),
      url: text(f, "url"),
      priceCents: price,
      observedAt: text(f, "observed_at"),
      priceType: text(f, "price_type"),
      brand: text(f, "brand"),
      model: text(f, "model") || null,
      category: text(f, "category"),
      condition: text(f, "condition"),
      similarityBps: Number(text(f, "similarity")) * 100,
      evidence: text(f, "evidence"),
      currency: "CAD",
      market: "Canada",
      accessBasis: "manual_authorized",
    },
  });
  finish(
    id,
    error?.message ?? null,
    "Market evidence saved. Request a new analysis to include it.",
  );
}
export async function invalidateComparable(f: FormData) {
  const id = itemId(f);
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_invalidate_market_comparable", {
    target: text(f, "comparable_id"),
    reason: text(f, "reason"),
  });
  finish(
    id,
    error?.message ?? null,
    "Evidence invalidated; the original record is retained.",
  );
}
export async function requestAnalysis(f: FormData) {
  const id = itemId(f);
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_request_pricing_analysis", {
    target: id,
  });
  if (!error && pricingWorkerReady()) {
    try {
      await processPricingJobs();
    } catch {
      finish(id, "Analysis is queued; the worker is unavailable. Manual pricing remains available.", "");
    }
  }
  finish(
    id,
    error?.message ?? null,
    "Analysis requested. Completed results appear below; queued jobs can be retried.",
  );
}
export async function approvePrice(f: FormData) {
  const id = itemId(f);
  const { supabase } = await requireAdmin();
  const price = cents(text(f, "price"));
  if (!Number.isSafeInteger(price) || text(f, "reviewed") !== "yes")
    finish(
      id,
      "Review the price, economics and seller terms before approving.",
      "",
    );
  const { error } = await supabase.rpc("admin_approve_item_price", {
    target: id,
    expected_snapshot: text(f, "snapshot"),
    price_cents: price,
    reason: text(f, "reason"),
    analysis: text(f, "analysis") || null,
  });
  finish(
    id,
    error?.message ?? null,
    "Price approved and commission preserved. Publication remains a separate action.",
  );
}
export async function publishApprovedPrice(f: FormData) {
  const id = itemId(f);
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_publish_item", {
    target_item_id: id,
    target_listed_price_cents: Number(text(f, "approved_price")),
  });
  finish(id, error?.message ?? null, "Item published at its approved price.");
}
export async function savePricingRules(f: FormData) {
  const id = itemId(f);
  const { supabase } = await requireAdmin();
  const keys = [
    "maxAgeDays",
    "minSoldComparables",
    "minSimilarityBps",
    "processingCents",
    "storageCents",
    "paymentFixedCents",
    "paymentBps",
    "minimumProfitCents",
  ];
  const rules: Record<string, number | null | number[]> = Object.fromEntries(
    keys.map((key) => [key, text(f, key) === "" ? null : Number(text(f, key))]),
  );
  rules.reviewDays =
    text(f, "reviewDays") === ""
      ? []
      : text(f, "reviewDays")
          .split(",")
          .map((v) => Number(v.trim()));
  const { error } = await supabase.rpc("admin_save_pricing_rules", {
    expected_version: Number(text(f, "version")),
    rules,
    reason: text(f, "reason"),
  });
  finish(
    id,
    error?.message ?? null,
    "New rule version saved. Existing approvals and paid orders are unchanged.",
  );
}
