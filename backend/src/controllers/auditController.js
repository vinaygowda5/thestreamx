const sb = require("../models/db");
const { ok, err } = require("../utils/response");

async function listAuditLogs(req, res) {
  if (!req.isSuperAdmin) return err(res, "Only Super Admin can view audit logs", 403);
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const { data, error } = await sb.from("audit_logs")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

module.exports = { listAuditLogs };