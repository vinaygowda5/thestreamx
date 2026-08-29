const sb = require("../models/db");
const { ok, err } = require("../utils/response");
const webpush = require("web-push");

// Set VAPID keys (generate once, store in Railway env)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:" + (process.env.ADMIN_EMAILS || "admin@nammacinema.in").split(",")[0],
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Send notification to ONE user
async function sendToUser(req, res) {
  const { user_id, title, message, type = "general", url } = req.body;
  if (!user_id || !title) return err(res, "user_id and title required");

  try {
    // Save to DB notifications table
    const { data, error } = await sb.from("notifications").insert({
      user_id, type, title, message, is_read: false,
    }).select().single();
    if (error) throw error;

    // Try push notification if subscription stored
    const { data: sub } = await sb
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", user_id)
      .single();

    if (sub?.subscription && process.env.VAPID_PUBLIC_KEY) {
      try {
        await webpush.sendNotification(
          JSON.parse(sub.subscription),
          JSON.stringify({ title, body: message, url: url || "/" })
        );
      } catch(e) {
        // Push failed (user revoked permission) — just log, don't fail
        console.log("Push failed for user:", user_id, e.statusCode);
      }
    }

    return ok(res, data, "Notification sent");
  } catch(e) {
    return err(res, "Failed: " + e.message, 500);
  }
}

// Broadcast notification to ALL users
async function broadcast(req, res) {
  if (req.user.role !== "admin") return err(res, "Admin only", 403);
  const { title, message, type = "announcement" } = req.body;
  if (!title) return err(res, "title required");

  try {
    // Get all active users
    const { data: users } = await sb
      .from("users")
      .select("id")
      .eq("is_active", true);

    if (!users?.length) return ok(res, null, "No users found");

    // Insert notification for all users at once
    const rows = users.map(u => ({
      user_id: u.id, type, title, message, is_read: false,
    }));

    const { error } = await sb.from("notifications").insert(rows);
    if (error) throw error;

    // Send push to all subscribed users
    if (process.env.VAPID_PUBLIC_KEY) {
      const { data: subs } = await sb
        .from("push_subscriptions")
        .select("subscription");

      let sent = 0;
      for (const s of (subs || [])) {
        try {
          await webpush.sendNotification(
            JSON.parse(s.subscription),
            JSON.stringify({ title, body: message, url: "/" })
          );
          sent++;
        } catch(e) {}
      }
      return ok(res, { total: users.length, pushed: sent }, `Broadcast sent to ${users.length} users`);
    }

    return ok(res, { total: users.length }, `Notification saved for ${users.length} users`);
  } catch(e) {
    return err(res, "Broadcast failed: " + e.message, 500);
  }
}

module.exports = { sendToUser, broadcast };
