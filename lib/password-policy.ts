export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENT_TEXT =
  "Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and a symbol (for example ! or ?).";

// Kept in one shared place so signup and recovery forms cannot drift apart.
export const PASSWORD_HTML_PATTERN =
  "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{8,}";

export function passwordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_REQUIREMENT_TEXT;
  if (!/[a-z]/.test(password)) return PASSWORD_REQUIREMENT_TEXT;
  if (!/[A-Z]/.test(password)) return PASSWORD_REQUIREMENT_TEXT;
  if (!/[0-9]/.test(password)) return PASSWORD_REQUIREMENT_TEXT;
  if (!/[^A-Za-z0-9\s]/.test(password)) return PASSWORD_REQUIREMENT_TEXT;
  return null;
}
