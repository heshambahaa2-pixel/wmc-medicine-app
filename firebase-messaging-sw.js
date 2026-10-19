/* Service worker: push notifications + offline app shell.
   Push is handled directly (no Firebase SDK in the worker) so every message is shown deterministically. */

const CACHE = "wmc-shell-v5";
const SHELL = ["./", "index.html", "styles.css?v=3", "app.js?v=4", "config.js", "manifest.json", "icons/icon-192.png"];
const ICON = new URL("icons/icon-192.png", self.registration.scope).href;

self.addEventListener("push", event => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { try { p = { data: { body: event.data.text() } }; } catch (_) {} }
  const n = p.notification || {};
  const d = p.data || {};
  const title = n.title || d.title || "WMC Medicine";
  const body = n.body || d.body || "";
  const url = d.url || (p.fcmOptions && p.fcmOptions.link) || (n.click_action) || new URL("./", self.registration.scope).href;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: ICON,
      badge: ICON,
      tag: d.tag || "wmc-" + Date.now(),
      renotify: true,
      data: { url }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || new URL("./", self.registration.scope).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope) && "focus" in w) { w.navigate && w.navigate(target); return w.focus(); }
    return clients.openWindow(target);
  }));
});

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
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
