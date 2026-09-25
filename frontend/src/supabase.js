import { createClient } from "@supabase/supabase-js";

const URL = "https://rimmzvmebnyzxrycuubk.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpbW16dm1lYm55enhyeWN1dWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjM0NzcsImV4cCI6MjA5NTM5OTQ3N30.khXzHByowmD2zWk0xW4DwdVfGrIsEq3O4SYj5twA6aU";

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/* ── LIGHTWEIGHT TTL CACHE ──
   Frontend talks to Supabase directly, not through the Express backend,
   so caching belongs here. Keeps tab-switching and back-navigation instant
   without needing Redis/infra. Default TTL 60s — content doesn't change
   every second, so this is safe and invisible to the user. */
const _cache = new Map(); // key -> { data, expiresAt }

export function cachedQuery(key, fetchFn, ttlMs = 60000) {
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.data);
  return fetchFn().then(data => {
    _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

export function invalidateCache(prefix) {
  for (const k of _cache.keys()) if (!prefix || k.startsWith(prefix)) _cache.delete(k);
}

export const db = {

  /* ── USERS ── */
  async getUserByPhone(phone) {
    const { data } = await supabase.from("users").select("*").eq("phone", phone).single();
    return data;
  },
  async getUserByEmail(email) {
    const { data } = await supabase.from("users").select("*").eq("email", email).single();
    return data;
  },
  async getUserById(id) {
    const { data } = await supabase.from("users").select("*").eq("id", id).single();
    return data;
  },
  async createUserWithId(id, d) {
    const { data, error } = await supabase.from("users").insert({ id, ...d }).select().single();
    if (error) throw error;
    return data;
  },
  async createUser(d) {
    const { data, error } = await supabase.from("users").insert(d).select().single();
    if (error) throw error;
    return data;
  },
  async updateUser(id, d) {
    const { data, error } = await supabase.from("users").update({ ...d, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  /* ── CONTENT ── */
  async getAllContent() {
    const { data } = await supabase.from("content").select("*").eq("is_active", true).order("created_at", { ascending: false });
    return data || [];
  },
  async getAllContentAdmin() {
    // Admin gets ALL content including inactive
    const { data } = await supabase.from("content").select("*").order("created_at", { ascending: false });
    return data || [];
  },
  async addContent(d) {
    const { data, error } = await supabase.from("content").insert(d).select().single();
    if (error) throw error;
    return data;
  },
  async updateContent(id, d) {
    const { data, error } = await supabase.from("content").update(d).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

    // ✅ REAL DELETE — permanently removes from database
  async deleteContent(id) {
    const { error } = await supabase.from("content").delete().eq("id", id);
    if (error) throw error;
    return true;
  },

  /* ── REAL VIEWS + LIKES ──
     Requires the SQL migration (increment_content_views / toggle_content_like
     RPC functions + content_likes table) to be run in Supabase first. */
  async incrementViews(contentId) {
    const { error } = await supabase.rpc("increment_content_views", { p_content_id: contentId });
    if (error) console.error("incrementViews failed:", error.message);
  },
  async toggleLike(contentId, userId) {
    if (!userId) throw new Error("Must be logged in to like");
    const { data, error } = await supabase.rpc("toggle_content_like", { p_content_id: contentId, p_user_id: userId });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },
  async hasLiked(contentId, userId) {
    if (!userId) return false;
    const { data } = await supabase.from("content_likes").select("id").eq("content_id", contentId).eq("user_id", userId).maybeSingle();
    return !!data;
  },

  /* ── WATCHLIST ── */
  async getWatchlist(userId) {
    const { data } = await supabase.from("watchlist").select("*, content(*)").eq("user_id", userId).order("added_at", { ascending: false });
    return data || [];
  },
  async addToWatchlist(userId, contentId) {
    const { data, error } = await supabase.from("watchlist").insert({ user_id: userId, content_id: contentId }).select().single();
    if (error) throw error;
    return data;
  },
  async removeFromWatchlist(userId, contentId) {
    await supabase.from("watchlist").delete().eq("user_id", userId).eq("content_id", contentId);
  },
  async isInWatchlist(userId, contentId) {
    const { data } = await supabase.from("watchlist").select("id").eq("user_id", userId).eq("content_id", contentId).single();
    return !!data;
  },

  /* ── HISTORY ── */
  async getHistory(userId) {
    const { data } = await supabase.from("watch_history").select("*, content(*)").eq("user_id", userId).order("watched_at", { ascending: false }).limit(20);
    return data || [];
  },
  async getProgress(userId, contentId) {
    if (!userId || !contentId) return null;
    const { data } = await supabase.from("watch_history").select("progress_seconds,progress_pct")
      .eq("user_id", userId).eq("content_id", contentId).maybeSingle();
    // Don't resume if already basically finished (>=94%) — treat as a fresh watch
    if (data && data.progress_pct < 94) return data.progress_seconds;
    return null;
  },
  async saveProgress(userId, contentId, progressSeconds, totalSeconds) {
    const pct = totalSeconds > 0 ? Math.round((progressSeconds / totalSeconds) * 100) : 0;
    await supabase.from("watch_history").upsert({
      user_id: userId, content_id: contentId,
      progress_seconds: progressSeconds, total_seconds: totalSeconds,
      progress_pct: pct, watched_at: new Date().toISOString(),
    }, { onConflict: "user_id,content_id" });
  },
  async clearHistory(userId) {
    await supabase.from("watch_history").delete().eq("user_id", userId);
  },

  /* ── PROFILES ── */
  async getProfiles(userId) {
    const { data } = await supabase.from("profiles").select("*").eq("user_id", userId);
    return data || [];
  },

  /* ── NOTIFICATIONS ── */
  async getNotifications(userId) {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    return data || [];
  },
  async markNotifRead(id) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  },
  async markAllNotifsRead(userId) {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId);
  },

  /* ── SUBSCRIPTIONS ── */
  async getSubscription(userId) {
    const { data } = await supabase.from("subscriptions").select("*").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data;
  },
  async createSubscription(userId, planId, amount, paymentId) {
    const end = new Date();
    end.setMonth(end.getMonth() + (planId === "plan_annual" ? 12 : 1));
    const { data, error } = await supabase.from("subscriptions").insert({
      user_id: userId, plan_id: planId, status: "active",
      amount, payment_id: paymentId, end_date: end.toISOString(),
    }).select().single();
    if (error) throw error;
    await supabase.from("users").update({ plan: planId }).eq("id", userId);
    await supabase.from("transactions").insert({ user_id: userId, plan_id: planId, amount, status: "success", payment_id: paymentId }).catch(() => {});
    return data;
  },

  /* ── ADS ── */
  async getAdsForUser(userId, type) {
    const user = userId ? await db.getUserById(userId).catch(() => null) : null;
    const plan = user?.plan || "free";
    if (["plan_premium", "plan_annual", "premium"].includes(plan)) return [];
    const { data } = await supabase.from("ads").select("*").eq("is_active", true).eq("type", type).order("priority").limit(1);
    return data || [];
  },
  async getAllAds() {
    const { data } = await supabase.from("ads").select("*").order("created_at", { ascending: false });
    return data || [];
  },
  async addAd(d) {
    const { data, error } = await supabase.from("ads").insert(d).select().single();
    if (error) throw error;
    return data;
  },
  async updateAd(id, d) {
    const { data, error } = await supabase.from("ads").update(d).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteAd(id) {
    const { error } = await supabase.from("ads").delete().eq("id", id);
    if (error) throw error;
    return true;
  },

  /* ── ADMIN STATS ── */
  async getAdminStats() {
    const [u, c, s, t, a] = await Promise.all([
      supabase.from("users").select("id", { count: "exact" }),
      supabase.from("content").select("id, views", { count: "exact" }).eq("is_active", true),
      supabase.from("subscriptions").select("id", { count: "exact" }).eq("status", "active"),
      supabase.from("transactions").select("amount").eq("status", "success"),
      supabase.from("ads").select("id, is_active"),
    ]);
    return {
      totalUsers:   u.count || 0,
      totalContent: c.count || 0,
      activeSubs:   s.count || 0,
      totalRevenue: (t.data || []).reduce((sum, x) => sum + (x.amount || 0), 0),
      totalViews:   (c.data || []).reduce((sum, x) => sum + (x.views || 0), 0),
      activeAds:    (a.data || []).filter(x => x.is_active).length,
    };
  },
  async getAllUsers() {
    const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    return data || [];
  },
  async suspendUser(id) {
    await supabase.from("users").update({ is_active: false }).eq("id", id);
  },
  async activateUser(id) {
    await supabase.from("users").update({ is_active: true }).eq("id", id);
  },
};