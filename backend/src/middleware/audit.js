const sb = require("../models/db");

// Fire-and-forget by design in most call sites — a logging failure should
// never block the actual request. Callers that need the row back (rare)
// can still await this and read the return value.
async function logAudit({ req, action, resourceType, resourceId, before, after, approvalRequestId, result = "success", reason }) {
  try {
    const userId = req?.user?.id || null;
    const row = {
      user_id: userId,
      user_name: req?.user?.name || null,
      role: req?.employeeRole || req?.user?.role || null,
      action,
      resource_type: resourceType || null,
      resource_id: resourceId ? String(resourceId) : null,
      before_value: before || null,
      after_value: after || null,
      approval_request_id: approvalRequestId || null,
      ip_address: req?.ip || req?.headers?.["x-forwarded-for"] || null,
      user_agent: req?.headers?.["user-agent"] || null,
      result,
      reason: reason || null,
    };
    const { data } = await sb.from("audit_logs").insert(row).select().single();
    return data;
  } catch (e) {
    console.error("audit log write failed (non-fatal):", e.message);
    return null;
  }
}

module.exports = { logAudit };