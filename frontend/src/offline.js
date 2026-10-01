// Real in-app offline downloads — like Jio Hotstar, a downloaded video is
// locked inside StreamX only. It is NOT saved to the phone's Gallery/Files
// app (no website can do that — it's not something any browser exposes).
// Instead we use the browser's own private Cache Storage, in a cache
// namespace separate from the PWA's app-shell cache (see public/sw.js) so
// clearing one never affects the other.
//
// Honest limits, stated plainly rather than hidden:
// - Only works for a direct video file (.mp4 etc). HLS (.m3u8) streams are
//   many small segment files, not one file — caching "the whole video" that
//   way needs a much bigger piece of engineering we haven't built.
// - The browser can evict this cache under storage pressure (especially on
//   iOS Safari), same as any other site data — it is not guaranteed forever
//   the way Hotstar's own encrypted on-device storage is.

const OFFLINE_CACHE = "streamx-offline-videos";

export function offlineSupported() {
  return typeof caches !== "undefined";
}

export async function cacheVideoForOffline(url, onProgress) {
  if (!offlineSupported()) throw new Error("Offline downloads aren't supported in this browser");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not fetch the video file");
  const cache = await caches.open(OFFLINE_CACHE);
  await cache.put(url, response.clone());
  return true;
}

export async function isCachedOffline(url) {
  if (!offlineSupported() || !url) return false;
  const cache = await caches.open(OFFLINE_CACHE);
  const match = await cache.match(url);
  return !!match;
}

// Returns a blob: URL that plays entirely from local cache — no network
// needed — or null if this title isn't (or no longer is) cached.
export async function getOfflineBlobUrl(url) {
  if (!offlineSupported() || !url) return null;
  const cache = await caches.open(OFFLINE_CACHE);
  const match = await cache.match(url);
  if (!match) return null;
  const blob = await match.blob();
  return URL.createObjectURL(blob);
}

export async function removeOfflineCache(url) {
  if (!offlineSupported() || !url) return;
  const cache = await caches.open(OFFLINE_CACHE);
  await cache.delete(url);
}

export function isPremiumPlan(user) {
  return ["plan_premium", "plan_annual", "premium"].includes(user?.plan);
}