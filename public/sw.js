// Minimal service worker — needed for PWA installability.
// Network-first, no aggressive caching to avoid stale UI issues.
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {
  // pass-through; presence of fetch handler satisfies install criteria
});