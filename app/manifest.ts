import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    scope: "/",
    name: "Shikimomo",
    short_name: "Shikimomo",
    description: "Managed secondhand shopping and selling in Montréal.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#22221f",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
