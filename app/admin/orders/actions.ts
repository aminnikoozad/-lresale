"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";

function notice(message: string): never {
  revalidatePath("/admin/orders");
  revalidatePath("/account/purchases");
  redirect(`/admin/orders?${new URLSearchParams({ message })}`);
}

export async function progressOrder(form: FormData) {
  const { supabase, access } = await requireAdmin();
  if (!access.can_manage_shipping || !access.has_aal2) redirect("/admin/mfa");
  const order = String(form.get("order") ?? "");
  const status = String(form.get("status") ?? "");
  const tracking = String(form.get("tracking") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(order) || !["processing", "shipped", "delivered"].includes(status)) {
    notice("Invalid order update.");
  }
  const { error } = await supabase.rpc("admin_progress_order", {
    p_order: order,
    p_next_status: status,
    p_tracking_number: tracking || null,
  });
  notice(error ? "The order could not be updated. Verify payment, its current step and tracking details." : "Fulfilment status updated.");
}

export async function reviewReturn(form: FormData) {
  const { supabase, access } = await requireAdmin();
  if (!access.has_aal2 || !["owner", "admin"].includes(access.role)) redirect("/admin/mfa");
  const request = String(form.get("request") ?? "");
  const decision = String(form.get("decision") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(request) || !["reviewing", "approved", "denied"].includes(decision)) {
    notice("Invalid return review.");
  }
  const { error } = await supabase.rpc("admin_review_return", { p_return: request, p_decision: decision });
  notice(error ? "Return review could not be saved. Check the current state." : "Return review saved. This did not issue a refund.");
}
