const sb = require("../models/db");
const { ok, err } = require("../utils/response");
const { logAudit } = require("../middleware/audit");
const { createApprovalRequest } = require("./approvalController");

async function getStats(req, res) {
  const [u, c, s, t, a] = await Promise.all([
    sb.from("users").select("id", { count: "exact" }),
    sb.from("content").select("id,views", { count: "exact" }).eq("is_active", true),
    sb.from("subscriptions").select("id", { count: "exact" }).eq("status", "active"),
    sb.from("transactions").select("amount").eq("status", "success"),
    sb.from("ads").select("id,is_active"),
  ]);
  return ok(res, {
    totalUsers:   u.count || 0,
    totalContent: c.count || 0,
    activeSubs:   s.count || 0,
    totalRevenue: (t.data || []).reduce((sum,x) => sum + (x.amount || 0), 0),
    totalViews:   (c.data || []).reduce((sum,x) => sum + (x.views || 0), 0),
    activeAds:    (a.data || []).filter(x => x.is_active).length,
  });
}

async function getAllUsers(req, res) {
  const { data } = await sb.from("users").select("*").order("created_at", { ascending: false });
  return ok(res, data || []);
}

async function suspendUser(req, res) {
  await sb.from("users").update({ is_active: false }).eq("id", req.params.id);
  return ok(res, null, "User suspended");
}

async function activateUser(req, res) {
  await sb.from("users").update({ is_active: true }).eq("id", req.params.id);
  return ok(res, null, "User activated");
}

async function getAllContent(req, res) {
  const { data } = await sb.from("content").select("*").order("created_at", { ascending: false });
  return ok(res, data || []);
}

async function addContent(req, res) {
  const { data, error } = await sb.from("content").insert(req.body).select().single();
  if (error) return err(res, error.message);
  return ok(res, data, "Content added");
}

async function updateContent(req, res) {
  const { data, error } = await sb.from("content").update(req.body).eq("id", req.params.id).select().single();
  if (error) return err(res, error.message);
  return ok(res, data, "Content updated");
}

async function deleteContent(req, res) {
  const { id } = req.params;
  const { reason } = req.body || {};

  if (req.isSuperAdmin) {
    // Super Admin acts immediately — still soft-delete (recoverable), not destroyed.
    const { error } = await sb.from("content")
      .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: req.user.id })
      .eq("id", id);
    if (error) return err(res, error.message);
    await logAudit({ req, action: "DELETE_MOVIE", resourceType: "content", resourceId: id });
    return ok(res, null, "Content deleted");
  }

  // Any other employee: cannot delete directly. Creates an approval
  // request instead — this is the actual security boundary, enforced
  // server-side, not just a hidden button on the frontend.
  const request = await createApprovalRequest({
    req, action: "DELETE_MOVIE", resourceType: "content", resourceId: id,
    payload: { contentId: id }, reason,
  });
  return ok(res, { requestId: request.id }, "Your request has been submitted for Super Admin approval.");
}

async function getAllAds(req, res) {
  const { data } = await sb.from("ads").select("*").order("created_at", { ascending: false });
  return ok(res, data || []);
}

async function addAd(req, res) {
  const { data, error } = await sb.from("ads").insert(req.body).select().single();
  if (error) return err(res, error.message);
  return ok(res, data);
}

async function updateAd(req, res) {
  const { data, error } = await sb.from("ads").update(req.body).eq("id", req.params.id).select().single();
  if (error) return err(res, error.message);
  return ok(res, data);
}

async function deleteAd(req, res) {
  await sb.from("ads").delete().eq("id", req.params.id);
  return ok(res, null, "Ad deleted");
}

module.exports = { getStats, getAllUsers, suspendUser, activateUser, getAllContent, addContent, updateContent, deleteContent, getAllAds, addAd, updateAd, deleteAd };