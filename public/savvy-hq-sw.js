// DSS HQ's service worker: shows push notifications for Messages and opens the channel when one
// is tapped. Registered by the notifications switch in Messages, for /savvy-hq/ only.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "DSS HQ", body: event.data ? event.data.text() : "" };
  }
  const url = new URL(d.url || "/savvy-hq/chat", self.location.origin).href;
  event.waitUntil(
    (async () => {
      // already reading that channel in a tab in front of you: no need to buzz
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.focused && w.visibilityState === "visible" && w.url === url)) return;
      await self.registration.showNotification(d.title || "DSS HQ", {
        body: d.body || "",
        icon: "/hq-icon-192.png",
        badge: "/hq-icon-192.png",
        tag: d.tag || undefined,
        renotify: Boolean(d.tag),
        data: { url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || new URL("/savvy-hq/chat", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const hq = windows.find((w) => new URL(w.url).pathname.startsWith("/savvy-hq"));
      if (hq) {
        await hq.focus();
        return hq.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
