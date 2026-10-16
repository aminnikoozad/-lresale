/** Check configuration consistency without returning or testing secret values. */
export function serviceCredentialReadiness(env: Record<string, string | undefined>, expectedUrl: string, isTest = false) {
  const normalize = (value: string) => value.trim().replace(/\/+$/, "");
  const urls = [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL].filter((value): value is string => Boolean(value?.trim()));
  const testTargetDeclared = (!isTest && env.NEXT_PUBLIC_SHIKIMOMO_ENV !== "test") ||
    Boolean(env.SUPABASE_URL?.trim() && normalize(env.SUPABASE_URL) === normalize(expectedUrl));
  const projectMatches = testTargetDeclared && urls.every(value => normalize(value) === normalize(expectedUrl));
  const keyConfigured = Boolean(env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  return { projectMatches, keyConfigured, ready: projectMatches && keyConfigured };
}
