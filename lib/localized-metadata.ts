import type { Metadata } from "next";
import { cookies } from "next/headers";

export async function localizedMetadata(english: Metadata, french: Metadata): Promise<Metadata> {
  const fr = (await cookies()).get("shikimomo-language")?.value === "fr";
  return fr ? { ...english, ...french } : english;
}
