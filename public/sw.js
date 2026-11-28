/* Blake Dowd Golf — Web Push service worker */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Blake Dowd Golf", body: "You have a new update.", href: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Blake Dowd Golf", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { href: data.href || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "notification-click", href });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
    }),
  );
});
