function firstDefined(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0);
}

export function getSupabaseConfig() {
  const url = firstDefined(
    process.env.STORAGE_URL,
    process.env.STORAGE_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const publishableKey = firstDefined(
    process.env.STORAGE_PUBLISHABLE_KEY,
    process.env.STORAGE_SUPABASE_PUBLISHABLE_KEY,
    process.env.STORAGE_ANON_KEY,
    process.env.STORAGE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!url || !publishableKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return { url, publishableKey };
}
