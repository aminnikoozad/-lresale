"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadSellingRules } from "@/lib/business-rules";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function centsFromDollars(raw: string) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

function itemsMessage(message: string, type: "success" | "error") {
  const params = new URLSearchParams({ message, type });
  return `/admin/items?${params.toString()}`;
}

async function authorizedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: allowed, error } = await supabase.rpc("can_manage_items");
  if (error || !allowed) redirect(itemsMessage("Item management permission is required.", "error"));
  return supabase;
}

function itemPhotos(formData: FormData) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  return formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0).slice(0, 8).map((file) => {
    if (!allowedTypes.has(file.type) || file.size > 8 * 1024 * 1024) {
      throw new Error("Photos must be JPG, PNG, WEBP or AVIF and no larger than 8 MB each.");
    }
    return file;
  });
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/avif") return "avif";
  return "jpg";
}

export async function createAdminItem(formData: FormData) {
  const supabase = await authorizedClient();
  const rules = await loadSellingRules(supabase);

  const ownerId = text(formData, "owner_id");
  const collectionRequestId = text(formData, "collection_request_id");
  const name = text(formData, "name");
  const brand = text(formData, "brand");
  const category = text(formData, "category");
  const size = text(formData, "size");
  const condition = text(formData, "item_condition");
  const priceCents = centsFromDollars(text(formData, "initial_price"));
  const belowMinimumAction = text(formData, "below_minimum_action") || "normal";
  const reason = text(formData, "reason");

  let photos: File[] = [];
  try {
    photos = itemPhotos(formData);
  } catch (error) {
    redirect(itemsMessage(error instanceof Error ? error.message : "Check the item photos.", "error"));
  }

  if (!ownerId || name.length < 2 || !Number.isInteger(priceCents) || priceCents < 1) {
    redirect(itemsMessage("Check the customer, item name and proposed price.", "error"));
  }

  if (priceCents < rules.minimumIndividualItemValueCents && belowMinimumAction === "normal") {
    redirect(itemsMessage(
      `This item is below the minimum individual listing value of $${(rules.minimumIndividualItemValueCents / 100).toFixed(2)}. Choose Add to Bundle, Reject, Manual Review or Owner Override.`,
      "error",
    ));
  }

  const advanced = await supabase.rpc("admin_create_item_v2", {
    target_owner_id: ownerId,
    target_collection_request_id: collectionRequestId || null,
    item_name: name,
    item_brand: brand || null,
    item_category: category,
    item_size: size || null,
    item_condition: condition || null,
    proposed_price_cents: priceCents,
    below_minimum_action: belowMinimumAction,
    action_reason: reason || null,
  });

  let itemId = typeof advanced.data === "string" ? advanced.data : null;
  let advancedIntakeEnabled = !advanced.error;

  if (advanced.error) {
    const missingAdvancedRpc = advanced.error.code === "PGRST202" || /admin_create_item_v2/i.test(advanced.error.message || "");
    if (!missingAdvancedRpc) {
      console.error("[admin/items] advanced create failed", { code: advanced.error.code, message: advanced.error.message });
      redirect(itemsMessage(advanced.error.message || "The item could not be created.", "error"));
    }

    const legacy = await supabase.rpc("admin_create_item", {
      target_owner_id: ownerId,
      item_name: name,
      item_brand: brand || null,
      item_category: category,
      proposed_price_cents: priceCents,
      below_minimum_action: belowMinimumAction,
      action_reason: reason || null,
    });
    if (legacy.error) {
      console.error("[admin/items] create failed", { code: legacy.error.code, message: legacy.error.message });
      redirect(itemsMessage(legacy.error.message || "The item could not be created.", "error"));
    }
    itemId = typeof legacy.data === "string" ? legacy.data : null;
    advancedIntakeEnabled = false;
  }

  if (advancedIntakeEnabled && itemId && photos.length) {
    const urls: string[] = [];
    for (const file of photos) {
      const path = `${itemId}/${crypto.randomUUID()}.${extensionFor(file)}`;
      const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) {
        console.error("[admin/items] photo upload failed", { message: uploadError.message });
        redirect(itemsMessage("The item was saved, but one or more photos could not be uploaded.", "error"));
      }
      const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
      urls.push(data.publicUrl);
    }

    const { error: photoError } = await supabase.rpc("admin_set_item_photos", {
      target_item_id: itemId,
      urls,
    });
    if (photoError) {
      console.error("[admin/items] photo metadata failed", { code: photoError.code, message: photoError.message });
      redirect(itemsMessage("The item was saved, but its photo list could not be attached.", "error"));
    }
  }

  revalidatePath("/admin/items");
  revalidatePath("/admin/operations");
  revalidatePath("/account");
  revalidatePath("/");

  if (!advancedIntakeEnabled && (collectionRequestId || size || condition || photos.length)) {
    redirect(itemsMessage("Item added. Apply the latest database migration to enable pickup linkage, size, condition and photo storage.", "success"));
  }
  redirect(itemsMessage("Item added to the customer account successfully.", "success"));
}

export async function reviewAdminItem(formData: FormData) {
  const supabase = await authorizedClient();
  const itemId = text(formData, "item_id");
  const priceCents = centsFromDollars(text(formData, "initial_price"));
  const action = text(formData, "review_action");
  const reason = text(formData, "reason");

  if (!itemId || !Number.isInteger(priceCents) || priceCents < 1 || !action) {
    redirect(itemsMessage("Check the review values.", "error"));
  }

  const { error } = await supabase.rpc("admin_review_item", {
    target_item_id: itemId,
    proposed_price_cents: priceCents,
    review_action: action,
    action_reason: reason || null,
  });

  if (error) {
    console.error("[admin/items] review failed", { code: error.code, message: error.message });
    redirect(itemsMessage(error.message || "The item review could not be saved.", "error"));
  }

  revalidatePath("/admin/items");
  revalidatePath("/account");
  redirect(itemsMessage("Item review saved.", "success"));
}

export async function createAdminBundle(formData: FormData) {
  const supabase = await authorizedClient();
  const ownerId = text(formData, "owner_id");
  const title = text(formData, "title");
  const priceCents = centsFromDollars(text(formData, "initial_price"));
  const reason = text(formData, "reason");
  const itemIds = formData
    .getAll("item_ids")
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (!ownerId || title.length < 2 || !Number.isInteger(priceCents) || priceCents < 1 || itemIds.length < 2) {
    redirect(itemsMessage("Choose one seller, at least two eligible items, a bundle title and a valid price.", "error"));
  }

  const { error } = await supabase.rpc("admin_create_bundle", {
    target_owner_id: ownerId,
    bundle_title: title,
    proposed_price_cents: priceCents,
    target_item_ids: itemIds,
    action_reason: reason || null,
  });

  if (error) {
    console.error("[admin/items] bundle failed", { code: error.code, message: error.message });
    redirect(itemsMessage(error.message || "The bundle could not be created.", "error"));
  }

  revalidatePath("/admin/items");
  revalidatePath("/account");
  redirect(itemsMessage("Bundle created and sent for seller price approval.", "success"));
}
