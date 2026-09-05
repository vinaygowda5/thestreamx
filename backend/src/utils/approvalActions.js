const sb = require("../models/db");
const { logAudit } = require("../middleware/audit");

// Each entry: { execute(payload, approverReq) } — runs ONLY after Super
// Admin approval. Keep these idempotent-ish and focused: they should do
// exactly the destructive thing the employee originally requested, nothing more.
const ACTIONS = {
  DELETE_MOVIE: {
    async execute(payload) {
      // Soft delete per spec section 12 — recoverable, not destroyed outright.
      const { error } = await sb.from("content")
        .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: payload.requestedBy })
        .eq("id", payload.contentId);
      if (error) throw new Error(error.message);
      return { contentId: payload.contentId };
    },
  },
  DELETE_SERIES: {
    async execute(payload) {
      const { error } = await sb.from("content")
        .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: payload.requestedBy })
        .eq("id", payload.contentId);
      if (error) throw new Error(error.message);
      return { contentId: payload.contentId };
    },
  },
  DELETE_LIVE_CHANNEL: {
    async execute(payload) {
      const { error } = await sb.from("content")
        .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: payload.requestedBy })
        .eq("id", payload.contentId);
      if (error) throw new Error(error.message);
      return { contentId: payload.contentId };
    },
  },
  DELETE_EMPLOYEE: {
    async execute(payload) {
      const { error } = await sb.from("users")
        .update({ employee_status: "DISABLED" }).eq("id", payload.employeeId);
      if (error) throw new Error(error.message);
      // Revoke sessions immediately on execution — see sessionController for the revoke helper.
      await sb.from("sessions").update({ revoked: true }).eq("user_id", payload.employeeId);
      return { employeeId: payload.employeeId };
    },
  },
  // Add more per your full spec list (bulk deletes, refunds, etc.) the same way —
  // one entry here, plus a createApprovalRequest() call at the point of use.
};

async function executeApprovedAction(request) {
  const handler = ACTIONS[request.action];
  if (!handler) throw new Error(`No executor registered for action: ${request.action}`);
  return handler.execute(request.payload || {});
}

module.exports = { ACTIONS, executeApprovedAction };