// Single source of truth for the backend URL. Change hosting providers by
// updating ONE Vercel environment variable (VITE_API_URL) — no code edits,
// no hunting through 6 files. Falls back to the current known backend if
// the env var isn't set, so nothing breaks if you forget to set it.
export const API = import.meta.env.VITE_API_URL || "https://streamx-backend-44cw.onrender.com";