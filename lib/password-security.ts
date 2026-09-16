import { createHash } from "node:crypto";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const REQUEST_TIMEOUT_MS = 4_000;

export type PasswordCompromiseResult = {
  compromised: boolean;
  occurrences: number;
};

export class PasswordSafetyUnavailableError extends Error {
  constructor() {
    super("Password safety service is temporarily unavailable.");
    this.name = "PasswordSafetyUnavailableError";
  }
}

export async function checkPasswordCompromise(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PasswordCompromiseResult> {
  // SHA-1 is required by the HIBP range API for k-anonymity. It is not used
  // to store or authenticate passwords. Only the first 5 hash characters
  // leave our server; the password and full hash never do.
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${PWNED_PASSWORDS_RANGE_URL}/${prefix}`, {
      method: "GET",
      headers: {
        "User-Agent": "REWEAR-Password-Safety/1.0",
        "Add-Padding": "true",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) throw new PasswordSafetyUnavailableError();

    const body = await response.text();
    for (const line of body.split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator <= 0) continue;
      const candidateSuffix = line.slice(0, separator).trim().toUpperCase();
      if (candidateSuffix !== suffix) continue;

      const count = Number.parseInt(line.slice(separator + 1).trim(), 10);
      const occurrences = Number.isFinite(count) && count > 0 ? count : 0;
      return { compromised: occurrences > 0, occurrences };
    }

    return { compromised: false, occurrences: 0 };
  } catch (error) {
    if (error instanceof PasswordSafetyUnavailableError) throw error;
    throw new PasswordSafetyUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
