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
