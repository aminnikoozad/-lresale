"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { homeFormData, HOME_PHOTO_ROLES } from "@/lib/home-decor";

async function client() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await db.rpc("can_manage_items");
  if (error || !data) redirect("/account");
  return db;
}
function done(message: string, item = ""): never {
  revalidatePath("/admin/home-decor");
  revalidatePath("/admin/items");
  revalidatePath("/");
  if (item) revalidatePath(`/item/${item}`);
  redirect(
    `/admin/home-decor?${new URLSearchParams({ message, ...(item ? { item } : {}) })}`,
  );
}
export async function saveHomeInspection(form: FormData) {
  const db = await client();
  const item = String(form.get("item_id") ?? "");
  let message =
    "Inspection saved. Publish from Item Management after all requirements are complete.";
  try {
    const payload = homeFormData(form);
    const urls = form.getAll("photo_url").map(String);
    const roles = form.getAll("photo_role").map(String);
    if (
      urls.length !== roles.length ||
      roles.some(
        (r) =>
          !HOME_PHOTO_ROLES.includes(r as (typeof HOME_PHOTO_ROLES)[number]),
      )
    )
      throw new Error("Check photo roles.");
    const { error } = await db.rpc("admin_save_home_item", {
      p_item: item,
      p_data: payload,
      p_photos: urls.map((url, index) => ({ url, role: roles[index] })),
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    message =
      error instanceof Error ? error.message : "Inspection could not be saved.";
  }
  done(message, item);
}
export async function saveHomeRules(form: FormData) {
  const db = await client();
  const raw = String(form.get("minimum") ?? "").trim();
  const minimum = raw ? Math.round(Number(raw) * 100) : null;
  if (
    minimum !== null &&
    (!Number.isSafeInteger(minimum) || minimum < 1 || minimum > 100000000)
  )
    done("Enter a valid minimum.");
  const { error } = await db.rpc("admin_save_home_rules", {
    p_minimum: minimum,
    p_bundle: form.get("bundle") === "on",
    p_oversized: form.get("oversized") === "on",
  });
  done(error?.message ?? "Home & Decor acceptance rules saved.");
}
export async function uploadHomePhotos(form: FormData) {
  const db = await client();
  const item = String(form.get("item_id") ?? "");
  let message = "Photos uploaded. Assign their roles and save the inspection.";
  try {
    const { data, error } = await db.rpc("admin_home_items");
    if (error) throw new Error(error.message);
    const record = (
      data as { item_id: string; photo_urls: string[]; status: string }[]
    ).find((i) => i.item_id === item);
    if (!record) throw new Error("Item not found.");
    if (["listed", "reserved", "sold"].includes(record.status))
      throw new Error(
        "Save the inspection to unpublish this item before changing photos.",
      );
    const files = form
      .getAll("photos")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length || files.length + (record.photo_urls?.length ?? 0) > 8)
      throw new Error("Select photos; a maximum of 8 is supported per item.");
    for (const file of files)
      if (
        !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
          file.type,
        ) ||
        file.size > 8 * 1024 * 1024
      )
        throw new Error("Use JPG, PNG, WEBP or AVIF up to 8 MB each.");
    const urls = [...(record.photo_urls ?? [])];
    for (const file of files) {
      const body = new FormData();
      body.set("item_id", item);
      body.set("file", file);
      const upload = await db.functions.invoke("admin-item-photo-upload", {
        body,
      });
      if (upload.error || typeof upload.data?.url !== "string")
        throw new Error("Photo upload failed.");
      urls.push(upload.data.url);
    }
    const saved = await db.rpc("admin_set_item_photos", {
      target_item_id: item,
      urls,
    });
    if (saved.error) throw new Error(saved.error.message);
  } catch (error) {
    message =
      error instanceof Error ? error.message : "Could not upload photos.";
  }
  done(message, item);
}
