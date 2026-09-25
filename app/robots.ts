import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/secure-admin-login",
        "/account/",
        "/checkout/",
        "/auth/",
        "/forgot-password",
        "/update-password",
        "/verify-phone",
        "/api/",
      ],
    },
    sitemap: `${siteConfig.siteUrl}/sitemap.xml`,
    host: siteConfig.siteUrl,
  };
}
