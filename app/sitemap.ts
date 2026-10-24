import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";
import { createPublicClient } from "@/lib/supabase/public";
import { loadPilotSettings, pilotAllowsCategory } from "@/lib/pilot-settings";
import { isItemId } from "@/lib/product-seo";
import { isCatalogCategory } from "@/lib/catalog-taxonomy";

export const dynamic = "force-dynamic";

const publicRoutes = [
  "/shop",
  "/sell",
  "/support",
  "/sell-with-shikimomo",
  "/pickup-policy",
  "/shipping-policy",
  "/privacy",
  "/terms",
  "/returns",
  "/seller-terms",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = publicRoutes.map((path) => ({
    url: `${siteConfig.siteUrl}${path}`,
    changeFrequency: path === "/shop" ? "daily" : "monthly",
    priority: path === "/shop" ? 1 : 0.6,
  }));
  // Use only the existing public catalogue, never the admin inventory or drafts.
  const client = createPublicClient();
  const [{ data, error }, pilot] = await Promise.all([client.rpc("catalog_items_v3"), loadPilotSettings(client)]);
  // Do not return a misleading, successful empty product sitemap on a DB outage.
  if (error) throw new Error("Public catalogue unavailable for sitemap");
  const items = (data ?? []).filter((item: { item_id: string; name: string; brand: string; category: string; photo_url: string | null; price_cents: number }) =>
    isItemId(item.item_id) && typeof item.name === "string" && typeof item.brand === "string" && isCatalogCategory(item.category) && pilotAllowsCategory(item.category, pilot) && item.photo_url && Number.isSafeInteger(item.price_cents) && item.price_cents > 0,
  ).slice(0, pilot.enabled && pilot.itemCap !== null ? pilot.itemCap : undefined);
  return [...pages, ...items.map((item: { item_id: string }) => ({ url: `${siteConfig.siteUrl}/item/${item.item_id}`, changeFrequency: "daily" as const, priority: 0.7 }))];
}
