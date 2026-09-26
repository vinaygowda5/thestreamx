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

const PLAN_NAMES = { plan_mobile: "Mobile", plan_basic: "Basic", plan_premium: "Premium", plan_annual: "Annual" };

// Real revenue — every number here comes straight from the transactions
// table (actual completed Razorpay payments), never from multiplying a
// user count by an assumed plan price.
async function getRevenueAnalytics(req, res) {
  const { data: txns, error } = await sb.from("transactions")
    .select("amount, plan_id, created_at")
    .eq("status", "success")
    .order("created_at", { ascending: true });
  if (error) return err(res, error.message, 500);

  const all = txns || [];
  const totalRevenue = all.reduce((s, t) => s + (t.amount || 0), 0);

  // Last 12 real calendar months, oldest to newest, zero-filled.
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }), value: 0 });
  }
  all.forEach(t => {
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const m = months.find(mo => mo.key === key);
    if (m) m.value += (t.amount || 0);
  });

  // Revenue by plan — actual sums, not guesses.
  const byPlan = {};
  all.forEach(t => {
    const key = t.plan_id || "unknown";
    byPlan[key] = (byPlan[key] || 0) + (t.amount || 0);
  });
  const revenueByPlan = Object.entries(byPlan).map(([plan_id, amount]) => ({
    plan_id, label: PLAN_NAMES[plan_id] || plan_id, amount,
  }));

  // This calendar month's real revenue vs last — an honest "recent trend"
  // instead of an "estimated monthly" guess.
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;
  const thisMonthRevenue = months.find(m => m.key === thisMonthKey)?.value || 0;
  const lastMonthRevenue = months.find(m => m.key === lastMonthKey)?.value || 0;

  return ok(res, { totalRevenue, thisMonthRevenue, lastMonthRevenue, monthlyRevenue: months, revenueByPlan, transactionCount: all.length });
}

const PLAN_NAMES = { plan_mobile: "Mobile", plan_basic: "Basic", plan_premium: "Premium", plan_annual: "Annual" };

// Real revenue — every number here comes straight from the transactions
// table (actual completed Razorpay payments), never from multiplying a
// user count by an assumed plan price.
async function getRevenueAnalytics(req, res) {
  const { data: txns, error } = await sb.from("transactions")
    .select("amount, plan_id, created_at")
    .eq("status", "success")
    .order("created_at", { ascending: true });
  if (error) return err(res, error.message, 500);

  const all = txns || [];
  const totalRevenue = all.reduce((s, t) => s + (t.amount || 0), 0);

  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }), value: 0 });
  }
  all.forEach(t => {
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const m = months.find(mo => mo.key === key);
    if (m) m.value += (t.amount || 0);
  });

  const byPlan = {};
  all.forEach(t => {
    const key = t.plan_id || "unknown";
    byPlan[key] = (byPlan[key] || 0) + (t.amount || 0);
  });
  const revenueByPlan = Object.entries(byPlan).map(([plan_id, amount]) => ({
    plan_id, label: PLAN_NAMES[plan_id] || plan_id, amount,
  }));

  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;
  const thisMonthRevenue = months.find(m => m.key === thisMonthKey)?.value || 0;
  const lastMonthRevenue = months.find(m => m.key === lastMonthKey)?.value || 0;

  return ok(res, { totalRevenue, thisMonthRevenue, lastMonthRevenue, monthlyRevenue: months, revenueByPlan, transactionCount: all.length });
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

module.exports = { getStats, getRevenueAnalytics, getAllUsers, suspendUser, activateUser, getAllContent, addContent, updateContent, deleteContent, getAllAds, addAd, updateAd, deleteAd };