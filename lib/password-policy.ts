export const PASSWORD_REQUIREMENTS_TEXT =
  "Use at least 8 characters, including 1 uppercase letter, 1 lowercase letter, 1 number and 1 special character (for example !, @, # or $).";

export function passwordMeetsPolicy(password: string) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
