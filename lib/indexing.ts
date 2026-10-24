/** These utility/account routes are not public search landing pages. */
export function isPrivateSearchRoute(pathname: string) {
  return /^\/(?:admin|account|auth|api|cart|checkout|login|signup|secure-admin-login|forgot-password|update-password|verify-phone|unsubscribe|demo-account|staging)(?:\/|$)/.test(pathname);
}
