export function validPushEndpoint(endpoint: string) {
 try {
  const url = new URL(endpoint);
  return url.protocol === "https:" && !url.username && !url.password && !url.port &&
   (["fcm.googleapis.com","updates.push.services.mozilla.com"].includes(url.hostname) ||
    url.hostname.endsWith(".push.apple.com") || url.hostname === "push.apple.com" ||
    url.hostname.endsWith(".notify.windows.com"));
 } catch { return false; }
}
