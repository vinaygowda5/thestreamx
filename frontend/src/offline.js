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

// Streams the file into the app's private cache and reports progress.
// onProgress(percent | null, loadedBytes, totalBytes) — percent is null when the server hides the file size.
export async function cacheVideoForOffline(url, onProgress) {
  if (!offlineSupported()) throw new Error("Offline downloads aren't supported in this browser");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not fetch the video file");
  const total = parseInt(response.headers.get("content-length") || "0", 10) || 0;
  const cache = await caches.open(OFFLINE_CACHE);

  if (!response.body || !response.body.tee) {            // very old browsers: no progress, still downloads
    await cache.put(url, response);
    onProgress && onProgress(100, total, total);
    return true;
  }
  const [forCache, forCount] = response.body.tee();       // one copy is saved, the other is counted for the % display
  const saving = cache.put(url, new Response(forCache, { status: 200, headers: response.headers }));
  const reader = forCount.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.length;
    onProgress && onProgress(total ? Math.min(99, Math.round((loaded / total) * 100)) : null, loaded, total);
  }
  await saving;
  onProgress && onProgress(100, loaded, total || loaded);
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