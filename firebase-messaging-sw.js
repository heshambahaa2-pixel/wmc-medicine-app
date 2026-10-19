/* Service worker: push notifications + offline app shell */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const CACHE = "wmc-shell-v2";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.json", "icons/icon-192.png"];

try {
  const cfg = JSON.parse(new URL(self.location).searchParams.get("c") || "{}");
  if (cfg.apiKey) {
    firebase.initializeApp(cfg);
    const messaging = firebase.messaging();
    // Data-only fallback; notification payloads are shown automatically by the SDK.
    messaging.onBackgroundMessage(p => {
      if (p.notification) return;
      const d = p.data || {};
      self.registration.showNotification(d.title || "WMC Medicine", { body: d.body || "", icon: "icons/icon-192.png", data: { url: d.url || "./" } });
    });
  }
} catch (e) { /* config missing */ }

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first for app files so updates show immediately; cache as offline fallback.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && (e.notification.data.url || e.notification.data.FCM_MSG?.notification?.click_action)) || "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ("focus" in w) return w.focus();
    return clients.openWindow(target);
  }));
});
