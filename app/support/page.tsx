import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SupportHub } from "@/components/support-hub";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const fr = (await cookies()).get("shikimomo-language")?.value === "fr";
  return {
    title: fr ? "Contact et soutien" : "Contact & support",
    description: fr ? "Communiquez avec l’équipe Shikimomo au sujet de votre compte, d’une collecte ou d’une commande." : "Contact the Shikimomo team about your account, a pickup or an order.",
  };
}

export default async function SupportPage() {
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Public contact details and recovery must remain reachable without an auth service.
  }
  return <SupportHub userId={userId} contact={{ email: siteConfig.supportEmail, phone: siteConfig.businessPhone, address: siteConfig.businessAddress, hoursEn: siteConfig.supportHoursEn, hoursFr: siteConfig.supportHoursFr }} />;
}
