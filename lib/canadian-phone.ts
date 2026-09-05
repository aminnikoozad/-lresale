// Geographic Canadian NPAs published by the Canadian Numbering Administrator.
const CANADIAN_AREA_CODES = new Set([
  "204", "226", "236", "249", "250", "257", "263", "273", "289", "306",
  "343", "354", "365", "367", "368", "382", "403", "416", "418", "428",
  "431", "437", "438", "450", "468", "474", "506", "514", "519", "548",
  "579", "581", "584", "587", "604", "613", "639", "647", "672", "683",
  "705", "709", "742", "753", "778", "780", "782", "807", "819", "825",
  "867", "873", "879", "902", "905", "942",
]);

export function isPhoneVerificationRequired() {
  return process.env.PHONE_VERIFICATION_REQUIRED === "true";
}

export function normalizeCanadianPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (
    national.length !== 10 ||
    !CANADIAN_AREA_CODES.has(national.slice(0, 3)) ||
    !/^[2-9]\d{2}[2-9]\d{6}$/.test(national)
  ) return null;

  return `+1${national}`;
}

export function formatCanadianPhone(phone: string) {
  const national = phone.replace(/\D/g, "").slice(-10);
  return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}
