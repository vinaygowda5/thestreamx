const sb = require("../models/db");
const { ok, err } = require("../utils/response");
const { logAudit } = require("../middleware/audit");
const { executeApprovedAction } = require("../utils/approvalActions");

// Called from other controllers instead of performing a destructive action
// directly, whenever the caller isn't SUPER_ADMIN.
async function createApprovalRequest({ req, action, resourceType, resourceId, payload, reason }) {
  const { data, error } = await sb.from("approval_requests").insert({
    requested_by: req.user.id,
    action, resource_type: resourceType, resource_id: resourceId ? String(resourceId) : null,
    payload: { ...payload, requestedBy: req.user.id },
    reason: reason || null,
    status: "PENDING",
  }).select().single();
  if (error) throw new Error(error.message);

  await logAudit({ req, action: `REQUESTED:${action}`, resourceType, resourceId, approvalRequestId: data.id, reason });
  return data;
}

async function listApprovals(req, res) {
  const status = req.query.status || "PENDING";
  const { data, error } = await sb.from("approval_requests")
    .select("*, requester:requested_by(name,email)")
    .eq("status", status).order("created_at", { ascending: false });
  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

async function approveRequest(req, res) {
  if (!req.isSuperAdmin) return err(res, "Only Super Admin can approve requests", 403);
  const { id } = req.params;

  const { data: request } = await sb.from("approval_requests").select("*").eq("id", id).single();
  if (!request) return err(res, "Request not found", 404);
  if (request.status !== "PENDING") return err(res, "Request is not pending", 400);
  if (request.requested_by === req.user.id) return err(res, "Cannot approve your own request", 403);

  try {
    const result = await executeApprovedAction(request);
    await sb.from("approval_requests").update({
      status: "APPROVED", reviewed_by: req.user.id, reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    await logAudit({ req, action: `APPROVED:${request.action}`, resourceType: request.resource_type, resourceId: request.resource_id, approvalRequestId: id, after: result });
    return ok(res, result, "Approved and executed");
  } catch (e) {
    await logAudit({ req, action: `APPROVE_FAILED:${request.action}`, approvalRequestId: id, result: "error", reason: e.message });
    return err(res, "Approved but execution failed: " + e.message, 500);
  }
}

async function rejectRequest(req, res) {
  if (!req.isSuperAdmin) return err(res, "Only Super Admin can reject requests", 403);
  const { id } = req.params;
  const { reason } = req.body;

  const { data: request } = await sb.from("approval_requests").select("*").eq("id", id).single();
  if (!request) return err(res, "Request not found", 404);
  if (request.status !== "PENDING") return err(res, "Request is not pending", 400);

  await sb.from("approval_requests").update({
    status: "REJECTED", reviewed_by: req.user.id, reviewed_at: new Date().toISOString(), reason: reason || request.reason,
  }).eq("id", id);
  await logAudit({ req, action: `REJECTED:${request.action}`, resourceType: request.resource_type, resourceId: request.resource_id, approvalRequestId: id, reason });
  return ok(res, null, "Rejected — no changes made");
}

async function myRequests(req, res) {
  const { data, error } = await sb.from("approval_requests")
    .select("*").eq("requested_by", req.user.id).order("created_at", { ascending: false });
  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

module.exports = { createApprovalRequest, listApprovals, approveRequest, rejectRequest, myRequests };