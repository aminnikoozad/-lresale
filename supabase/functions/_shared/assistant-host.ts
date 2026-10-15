/** Server-only configuration. Never accept an inference URL or credential from a visitor. */
export function assistantHostConfig(env: Record<string, string | undefined>) {
  const raw = env.SELF_HOSTED_AI_URL;
  const token = env.SELF_HOSTED_AI_TOKEN;
  if (!raw || !token || token.length < 32) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      return null;
    if (url.pathname !== "/") return null;
    return { url: url.origin, token };
  } catch {
    return null;
  }
}
