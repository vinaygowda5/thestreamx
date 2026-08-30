/*
  StreamX Service Worker
  - Makes app installable on phone (PWA)
  - Caches app shell so it loads instantly
  - Works offline for the UI (not videos — videos need internet)
  - Logs errors for monitoring
*/

const CACHE_NAME = "streamx-v2"; // bumped — forces existing installs to get a clean cache once
const APP_SHELL  = [
  "/",
  "/index.html",
  "/manifest.json",
];

// Install — cache app shell
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("[SW] Caching app shell");
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — serve from cache, fallback to network
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Never cache API calls or video streams
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("r2.dev") ||
    url.hostname.includes("openai.com") ||
    url.hostname.includes("razorpay.com") ||
    event.request.method !== "GET"
  ) {
    return; // Let network handle it
  }

  // For navigation requests — try network first (get latest), fall back to
  // cache only when offline. Cache-first here was the actual bug: it meant
  // new deploys never appeared until someone manually cleared site data.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("/index.html", clone));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // For assets — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Push Notifications
self.addEventListener("push", event => {
  const data = event.data?.json() || {};
  const title = data.title || "StreamX";
  const options = {
    body:    data.body    || "New content available!",
    icon:    "/icons/icon-192.png",
    badge:   "/icons/icon-72.png",
    vibrate: [200, 100, 200],
    data:    { url: data.url || "/" },
    actions: [
      { action: "open",    title: "Watch Now" },
      { action: "dismiss", title: "Dismiss"   },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Background sync (for offline actions)
self.addEventListener("sync", event => {
  if (event.tag === "sync-watchlist") {
    console.log("[SW] Syncing watchlist...");
  }
});