/** Check configuration consistency without returning or testing secret values. */
export function serviceCredentialReadiness(env: Record<string, string | undefined>, expectedUrl: string) {
  const normalize = (value: string) => value.trim().replace(/\/+$/, "");
  const urls = [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL].filter((value): value is string => Boolean(value?.trim()));
  const projectMatches = urls.every(value => normalize(value) === normalize(expectedUrl));
  const keyConfigured = Boolean(env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  return { projectMatches, keyConfigured, ready: projectMatches && keyConfigured };
}
