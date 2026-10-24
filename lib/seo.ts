import type { Metadata } from "next";
import { cookies } from "next/headers";
import { siteConfig } from "@/lib/site-config";

type Copy = { title: string; description: string };

export async function publicPageMetadata(path: string, en: Copy, fr: Copy): Promise<Metadata> {
  const french = (await cookies()).get("shikimomo-language")?.value === "fr";
  const copy = french ? fr : en;
  const url = new URL(path, siteConfig.siteUrl).href;
  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "Shikimomo", url, ...copy, locale: french ? "fr_CA" : "en_CA" },
    twitter: { card: "summary", ...copy },
  };
}
