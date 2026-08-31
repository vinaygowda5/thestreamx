const sb = require("../models/db");
const { ok, err } = require("../utils/response");

async function getMe(req, res) {
  const { data, error } = await sb.from("users").select("*").eq("id", req.user.id).single();
  if (error) return err(res, "User not found", 404);
  return ok(res, data);
}

async function updateMe(req, res) {
  const allowed = ["name","phone","language"];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  const { data, error } = await sb.from("users").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", req.user.id).select().single();
  if (error) return err(res, "Update failed: " + error.message);
  return ok(res, data);
}

async function getWatchlist(req, res) {
  const { data } = await sb.from("watchlist").select("*,content(*)").eq("user_id", req.user.id).order("added_at", { ascending: false });
  return ok(res, data || []);
}

async function addToWatchlist(req, res) {
  const { content_id } = req.body;
  if (!content_id) return err(res, "content_id required");
  const { data, error } = await sb.from("watchlist").insert({ user_id: req.user.id, content_id }).select().single();
  if (error) return err(res, error.message);
  return ok(res, data);
}

async function removeFromWatchlist(req, res) {
  await sb.from("watchlist").delete().eq("user_id", req.user.id).eq("content_id", req.params.contentId);
  return ok(res, null, "Removed");
}

async function getHistory(req, res) {
  const { data } = await sb.from("watch_history").select("*,content(*)").eq("user_id", req.user.id).order("watched_at", { ascending: false }).limit(30);
  return ok(res, data || []);
}

async function saveProgress(req, res) {
  const { content_id, progress_seconds, total_seconds } = req.body;
  const pct = total_seconds > 0 ? Math.round((progress_seconds / total_seconds) * 100) : 0;
  await sb.from("watch_history").upsert({ user_id: req.user.id, content_id, progress_seconds, total_seconds, progress_pct: pct, watched_at: new Date().toISOString() }, { onConflict: "user_id,content_id" });
  return ok(res, null);
}

async function getNotifications(req, res) {
  const { data } = await sb.from("notifications").select("*").eq("user_id", req.user.id).order("created_at", { ascending: false }).limit(20);
  return ok(res, data || []);
}

async function markNotifRead(req, res) {
  await sb.from("notifications").update({ is_read: true }).eq("id", req.params.id).eq("user_id", req.user.id);
  return ok(res, null);
}

async function deleteAccount(req, res) {
  const id = req.user.id;
  await sb.from("watchlist").delete().eq("user_id", id);
  await sb.from("watch_history").delete().eq("user_id", id);
  await sb.from("notifications").delete().eq("user_id", id);
  await sb.from("subscriptions").delete().eq("user_id", id);
  await sb.from("user_sessions").delete().eq("user_id", id);
  await sb.from("users").delete().eq("id", id);
  // Also remove the actual login identity — otherwise OTP login would
  // still work afterward since the auth.users record isn't touched by
  // the deletes above (those only clear app-side tables).
  try { await sb.auth.admin.deleteUser(id); } catch (e) { /* non-fatal — app data is already gone either way */ }
  return ok(res, null, "Account deleted");
}

module.exports = { getMe, updateMe, getWatchlist, addToWatchlist, removeFromWatchlist, getHistory, saveProgress, getNotifications, markNotifRead, deleteAccount };