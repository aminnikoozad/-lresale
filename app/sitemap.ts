import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

const publicRoutes = [
  "",
  "/sell-with-rewear",
  "/pickup-policy",
  "/shipping-policy",
  "/privacy",
  "/terms",
  "/returns",
  "/seller-terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return publicRoutes.map((path) => ({
    url: `${siteConfig.siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
