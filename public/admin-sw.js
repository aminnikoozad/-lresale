self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
 let payload = {};
 try { payload = event.data ? event.data.json() : {}; } catch {}
 const title = typeof payload.title === "string" ? payload.title.slice(0,100) : "Shikimomo";
 const body = typeof payload.body === "string" ? payload.body.slice(0,240) : "New admin activity. Open Shikimomo to review.";
 event.waitUntil(self.registration.showNotification(title, {
  body, icon:"/favicon.svg", badge:"/favicon.svg",
  tag:typeof payload.tag === "string" ? payload.tag.slice(0,180) : "shikimomo-admin",
  data:{url:typeof payload.url==="string"?payload.url:"/admin"}
 }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const fallback = "/admin";
  let target = fallback;
  const requested = event.notification?.data?.url;

  if (typeof requested === "string") {
    try {
      const parsed = new URL(requested, self.location.origin);
      if (parsed.origin === self.location.origin && parsed.pathname.startsWith("/admin")) {
        target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      target = fallback;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    }),
  );
});
