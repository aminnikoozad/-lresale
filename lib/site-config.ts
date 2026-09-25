const FALLBACK_SITE_URL = "https://lresale.vercel.app";

function httpsOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function clean(value: string | undefined, max = 200) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, max) : "";
}

export const siteConfig = {
  siteUrl: httpsOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? FALLBACK_SITE_URL,
  businessName: clean(process.env.NEXT_PUBLIC_BUSINESS_NAME, 120) || "Rewear Market",
  supportEmail: clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, 254),
  privacyEmail: clean(process.env.NEXT_PUBLIC_PRIVACY_EMAIL, 254),
  businessAddress: clean(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS, 300),
  businessPhone: clean(process.env.NEXT_PUBLIC_BUSINESS_PHONE, 40),
  privacyOfficerTitle: clean(process.env.NEXT_PUBLIC_PRIVACY_OFFICER_TITLE, 120) || "Privacy Officer / Responsable de la protection des renseignements personnels",
};

export function publicLaunchReadiness() {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SITE_URL) missing.push("NEXT_PUBLIC_SITE_URL");
  if (!siteConfig.supportEmail) missing.push("NEXT_PUBLIC_SUPPORT_EMAIL");
  if (!siteConfig.privacyEmail) missing.push("NEXT_PUBLIC_PRIVACY_EMAIL");
  if (!siteConfig.businessAddress) missing.push("NEXT_PUBLIC_BUSINESS_ADDRESS");
  if (!siteConfig.businessPhone) missing.push("NEXT_PUBLIC_BUSINESS_PHONE");
  return { ready: missing.length === 0, missing };
}
