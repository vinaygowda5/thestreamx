// Ad-break schedule (Hotstar-style: no ad before the video, then regular breaks while watching).
// Times are in seconds of content actually WATCHED (pausing / seeking doesn't count).
// Change them without touching code via Vercel environment variables:
//   VITE_AD_FIRST_BREAK_SEC  – first ad break after this much watching   (default 30)
//   VITE_AD_VOD_EVERY_SEC    – then every N seconds for movies / series  (default 360 = 6 min)
//   VITE_AD_LIVE_EVERY_SEC   – then every N seconds for live channels    (default 240 = 4 min)
const num = (v, d) => { const x = Number(v); return Number.isFinite(x) && x >= 5 ? x : d; };
export const AD_FIRST_BREAK_SEC = num(import.meta.env.VITE_AD_FIRST_BREAK_SEC, 30);
export const AD_VOD_EVERY_SEC   = num(import.meta.env.VITE_AD_VOD_EVERY_SEC, 360);
export const AD_LIVE_EVERY_SEC  = num(import.meta.env.VITE_AD_LIVE_EVERY_SEC, 240);
// Ads per break (like Hotstar's ad pods): default 3, max 5 (Hotstar runs up to 5)
export const AD_PER_BREAK       = Math.min(5, Math.max(1, Math.round(num(import.meta.env.VITE_AD_PER_BREAK, 3))));
export const AD_END_GUARD_SEC   = 45; // no ad break in the last 45 s of a movie