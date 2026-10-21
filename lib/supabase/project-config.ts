export const LEGACY_PRODUCTION_URL = "https://lsdhobwrnmlkqnvkamlt.supabase.co";

type PublicProjectOptions = {
  url?: string;
  publishableKey?: string;
  preview: boolean;
  fallbackPublishableKey: string;
};

/** Reject incomplete or production-targeting preview configuration before any client is created. */
export function resolvePublicProject(options: PublicProjectOptions) {
  const url = options.url?.trim();
  const key = options.publishableKey?.trim();
  if (Boolean(url) !== Boolean(key)) {
    throw new Error("Configure both public Supabase URL and publishable key for this environment");
  }
  const origin = new URL(url || LEGACY_PRODUCTION_URL).origin;
  if (options.preview && (!url || !key || origin === LEGACY_PRODUCTION_URL)) {
    throw new Error("Preview requires an explicitly configured separate Supabase test project");
  }
  if (new URL(origin).protocol !== "https:") {
    throw new Error("Supabase must use HTTPS");
  }
  return { url: origin, publishableKey: key || options.fallbackPublishableKey };
}
