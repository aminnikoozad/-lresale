import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

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

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((path) => ({
    url: `${siteConfig.siteUrl}${path}`,
    changeFrequency: path === "/shop" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
