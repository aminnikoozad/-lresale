export async function verifyTurnstile(token: string, secret: string) {
  if (!token || token.length > 2048) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true &&
      ["shikimomo.com", "www.shikimomo.com"].includes(result.hostname) &&
      result.action === "site_form";
  } catch { return false; }
}
